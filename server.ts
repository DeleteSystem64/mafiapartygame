

import { send } from 'process';
import WebSocket = require('ws');
import Game from './lib/Game';
import {generateRandomString} from './lib/Game'
import { Role } from './lib/Role';
import { GamePhase } from './lib/GamePhase';
import Player from './lib/Player';

const https = require('https');
const fs = require('fs');
const path = require('path');

const url = require('url');  
const options = {
  key: fs.readFileSync('./ssl/key.pem'),    //private key file
  cert: fs.readFileSync('./ssl/cert.pem'),  //certificate file
};
const server = https.createServer(options, (req:any, res:any) => {
  // Parse URL without query string or hash
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;

  // If root path, serve index.html
  if (pathname === '/') pathname = '/index.html';

  // Construct file path inside public folder
  let filePath = path.join(__dirname, 'public', pathname);

  // Normalize path to prevent directory traversal
  filePath = path.normalize(filePath);

  // Determine content type
  const extname = path.extname(filePath).toLowerCase();

  const mimeTypes:any = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err:any, content:any) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 - File Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});
const PORT = 443;  // Default HTTPS port
server.listen(PORT, () => {
  console.log(`HTTPS server running on port ${PORT}`);
});
const http = require('http');
// HTTP server that redirects all requests to HTTPS
http.createServer((req: any, res: any) => {
  // Construct redirect URL, preserving host and original path/query
  const host = req.headers['host'];
  const redirectUrl = `https://${host}${req.url}`;

  res.writeHead(301, {
    Location: redirectUrl
  });
  res.end();
}).listen(80, () => {
  console.log('HTTP server listening on port 80 and redirecting to HTTPS');
});
const wss:WebSocket.Server = new WebSocket.Server({ server });
const games: { [key:string]: Game} = {};
//TODO: give player a team member, and change checks for mafia to that 
const roleDescriptions: {[key:number]: string} = 
{
    0: "You are an innocent bystander.",
    1: "You are a soldier in your organization.",
    2: "You are a framer in your organziation.",
    3: "You are a doctor in the town.",
    4: "You are an investigator."
};

const abilityDescriptions: {[key:number]: string} = 
{
    0: "You don't have any special abilities.",
    1: "Each night, you can select 1 person to kill.",
    2: "Each night, you can select 1 person to frame. If an investigator spies on them that night, they will appear guilty.",
    3: "You can select 1 person to heal each night. If that person is attacked, you will prevent them from dying.",
    4: "You can select 1 person to spy on each night to figure out if they are a member of the mafia or not."
}

const roleToString:  {[key:number]: string} = 
{
    0: "an innocent bystander",
    1: "a killer in the mafia",
    2: "a framer working for the mafia",
    3: "a doctor",
    4: "an investigator"
}

const roleToAction: {[key:number]: string} =
{
    0: "Choose",
    1: "Kill",
    2: "Frame",
    3: "Heal",
    4: "Investigate"
}

const roleToNightDescription: {[key:number]: string} =
{
    0: "You don't have any special nightly abilities.",
    1: "You can choose to kill one person tonight. If there are multiple killers on the mafia team, you will all vote on who to kill.",
    2: "You can choose to frame one person tonight. If an investigator spies on them, they will appear guilty.",
    3: "You can choose to heal one person tonight.",
    4: "You can investigate someone tonight.",
    5: "You are dead, so you can't use any abilities. Instead, you can answer this question about the players in the room (this doesn't have any bearing on the game):"
}

const nightQuestions: string[]
=[
    "Who talked the most last round?",
    "Who is the second tallest?",
    "Who do you think could jump the highest?",
    "Who is the best liar?",
    "Who is the most competitive?",
    "Who is the most persuasive?"
]

function returnErrorToWs(ws:WebSocket, msg:string)
{
    return ws.send(JSON.stringify({error:msg}));
}

function returnMessageToWs(ws:WebSocket, type:string, payload:string)
{
    return ws.send(JSON.stringify({type:type, payload:payload}));
}

/***********************************************The Big Boy**************************************************/
wss.on('connection', (ws: WebSocket) => 
{
    ws.on('message', (msg: string) => 
    {
        let data;
        try 
        {
            data = JSON.parse(msg);
        }
        catch
        {
            console.log("Bad JSON");
            return returnErrorToWs(ws, "Could not parse JSON.")
        }
        if(data.type === 'create_game')
        {
            console.log("game created");
            let gameCode: string = generateRandomString(4);
            while(games[gameCode])
            {
                gameCode = generateRandomString(4);
            }
            games[gameCode] = new Game(gameCode);
            console.log(games[gameCode].numPlayers);
            return returnMessageToWs(ws, "create_success", gameCode);
        }
        else if(data.type === 'join_game')
        {
            
            //if(ws.gameCode) return returnErrorToWs(ws, "Player already in a game!");
            if(!data.gameCode) return returnErrorToWs(ws, "Incompatible JSON format.");
            if(!games[data.gameCode]) return returnErrorToWs(ws, "Could not find game with that ID!");
            let game: Game = games[data.gameCode];
            if(game.isGameStarted)
            {
                return returnErrorToWs(ws, "Game has already started. You cannot join now.");
            }
            let playerID: string = game.addNewPlayer(ws, data.playerName);
            
            //console.log("New Player " + JSON.stringify(games[data.gameCode].players[games[data.gameCode].getPlayerIndex(playerID)]));
            console.log("New player joined. ID: " + playerID);
            return ws.send(JSON.stringify({type:"join_success", playerID:playerID, gameID:data.gameCode}));
        }
        else if(data.type === 'enter_lobby')
        {
            //check if game exists
            if(!data.gameCode) return returnErrorToWs(ws, "Incompatible JSON format.");
            if(!data.playerID) return returnErrorToWs(ws, "Incompatible JSON format.");
            const game = games[data.gameCode];
            if(!game)
            {
                returnErrorToWs(ws,"Lobby does not exist. Try creating a new game.");
                return;
            }
            if(!(data.playerID in game.playerCodes) || !(game.playerCodes[data.playerID] in game.players))
            {
                //return returnErrorToWs(ws, JSON.stringify(game.players));
                return returnErrorToWs(ws, "Could not find that player. Try joining again.");
            }   
            
            //record that this player has joined
            game.enteredPlayers[data.playerID] = true;
            game.players[game.getPlayerIndex(data.playerID)].socket = ws;
            //if game has started, route to either night or day phase
            if(game.isGameStarted)
            {
                if(game.gamePhase == GamePhase.NIGHT_VOTE)
                {
                    
                    game.sendNightDataToClient(game.players[game.getPlayerIndex(data.playerID)]);
                }
                else if (game.gamePhase == GamePhase.DAY_VOTE)
                {
                    game.sendDayDataToClient(game.players[game.getPlayerIndex(data.playerID)]);
                }
                else if(game.gamePhase == GamePhase.GAME_OVER)
                {
                    game.sendMessageToClient(ws, "game_over", "Game has ended.");
                }
                else
                {
                    game.sendMessageToClient(ws, "message", "Please wait...");
                }
                return;
            }

            //get a list of every player that has joined
            let playerList: {[key:string]: any}[] = [];
            let message : {[key:string]: any} = {};
            message.type = "player_join";

            for(let i: number = 0; i < game.players.length; i++)
            {
                playerList.push({name:game.players[i].name});
                
            }
            message.playerList = playerList;

            //broadcast new player list to everyone
            let hostMessage = {...message};
            hostMessage.host = 1; 
            game.players[0].socket.send(JSON.stringify(hostMessage));

            for(let i: number = 1; i < game.players.length; i++)
            {
                game.players[i].socket.send(JSON.stringify(message));
            }
            return;
        }
        else if(data.type === "start_requested")
        {
            //check if game exists
            if(!games[data.gameCode])
            {
                return returnErrorToWs(ws,"Game does not exist. (Try starting a new game).");
            }
            let game: Game = games[data.gameCode];

            //check if there are enough players in yet
            if(game.numPlayers < game.minPlayers)
            {
                return returnErrorToWs(ws, "Not enough players (need at least " + game.minPlayers + ").");
            }

            //check if this is the host making the start request
            if(data.playerID != game.hostID)
            {
                return returnErrorToWs(ws, "You are not the host!");
            }

            //if the checks are passed, lets start the game
            //TODO: allow frontend host player to pass options, like types of roles and such
            //Generate random roles for everyone 
            game.setupGame();   
            //for now, print all the roles
            for(let i = 0; i < game.players.length; i++)
            {
                console.log(game.players[i].name + ": " + Role[game.players[i].role]);
            }

            //let frontend know what the user's role is, who their team is (if applicable), and other junk like that
            for(let i = 0; i < game.players.length; i++)
            {
                let player = game.players[i];
                let moby: {[key:string]: any} = {};
                moby.role = roleDescriptions[player.role as number];
                moby.ability = abilityDescriptions[player.role as number];
                game.gamePhase = GamePhase.GAME_START;

                //TODO: this is inefficient, use a method to get all mafia members in O(1) time rather than O(n)
                if(player.role == Role.FRAMER || player.role == Role.KILLER)
                {
                    moby.team = "Your fellow mafia members are: ";
                    let count = 0;
                    for(let j = 0; j < game.players.length; j++)
                    {
                        let otherPlayer = game.players[j];
                        if(j != i && (otherPlayer.role == Role.FRAMER || otherPlayer.role == Role.KILLER))
                        {
                            count++;
                            moby.team += otherPlayer.name + ",";
                        }
                    }
                    if(count == 0)
                    {
                        moby.team = "You don't have any fellow mafia members."
                    }
                }
                moby.type = "game_start";
                player.socket.send(JSON.stringify(moby));
            }

            //Game start message
            const intervalId = setTimeout( () => 
            {
                //Start day 1
                game.handleStartDay();

            },game.openingMessageTime)
            return;
        }
        else if(data.type === "vote")
        {
            console.log("Vote received: " + JSON.stringify(data));
            /********* CHECKING FOR BAD VOTES ***********/
            //check if game exists
            if(!(data.gameID in games))
            {
                return returnErrorToWs(ws, "This game does not exist.");
            }
            let game = games[data.gameID];
            //check if voter exists
            if(!(data.voterID in game.playerCodes) || (game.getPlayerIndex(data.voterID) > game.players.length) || (game.getPlayerIndex(data.voterID) < 0))
            {
                return returnErrorToWs(ws, "Voter does not exist.");
            }
            //check if target exists
            if(data.targetID < 0 || data.targetID > game.players.length)
            {
                return returnErrorToWs(ws,"Target does not exist");
            }
            //check if player is attempting to vote for dead player
            if(data.targetID < game.players.length && !game.players[data.targetID].isAlive)
            {
                return returnErrorToWs(ws, "Target is dead.");
            }
            let voter:Player = game.players[game.getPlayerIndex(data.voterID)];
            //check if voter is alive
            if(!voter.isAlive)
            {
                return returnErrorToWs(ws,"Voter is dead.");
            }
            //check to see if player has already voted, and is trying to vote for another player
            if(voter.votedFor > -1 && voter.votedFor != data.targetID)
            {
                return returnErrorToWs(ws, "Voter has already voted and is not rescinding their vote.");
            }
            //the vote will be handled differently depending on whether it is day or night
            if(game.isDayOver)
            {
                console.log("Handling night vote")
                //If player is trying to rescind their vote
                if(voter.votedFor == data.targetID)
                {
                    return game.handleNightRescind(data, ws);
                }
                //If player is trying to make a vote
                else
                {
                    return game.handleNightVote(data, ws);
                }
            }

            /******** HANDLING DAY VOTES ********/
            //if the player is voting to end the day, handle that
            if(data.targetID == game.players.length && voter.votedFor != game.players.length)
            {
                return game.handleVoteEndDay(data,ws);
            }
            //if the player is rescinding their vote to end the day, handle that
            else if(data.targetID == game.players.length)
            {
                return game.handleRescindEndDay(data, ws);
            }
            //if voter is voting to hang another player, handle that
            else if(voter.votedFor < 0)
            {
                return game.handleVoteHangPlayer(data,ws);
            }
            else
            {
                return game.handleRescindHangPlayer(data,ws);
            }
        }
        else if(data.type === "options_get")
        {
            if(!(data.gameID in games))
            {
                return returnErrorToWs(ws, "This game does not exist.");
            }
            let game = games[data.gameID];
            return game.sendOptionsDataToClient(ws);
        }
        else if(data.type === "options_set")
        {
            //check if game exists
            if(!(data.gameID in games))
            {
                return returnErrorToWs(ws, "This game does not exist.");
            }
            //check if player sending request is host
            //check if game is in progress
            let game = games[data.gameID];  
            return game.setOptions(ws, data.roles);
        }
    });
});


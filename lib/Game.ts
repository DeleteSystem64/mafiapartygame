//The Monolith

import WebSocket = require('ws');
import Player from './Player'
import { GamePhase } from './GamePhase';
import { Role } from './Role';
import { Team } from './Team';

function returnErrorToWs(ws:WebSocket, msg:string)
{
    return ws.send(JSON.stringify({error:msg}));
}
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

export function generateRandomString(length: number): string
{
  const chars:string = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result:string = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
export default class Game
{
    timestamp: number;
    numPlayers: number;
    maxPlayers: number;
    minPlayers: number;
    currentPlayer: number;
    numPlayersEntered: number;
    players: Player[];
    isGameStarted: boolean;
    enteredPlayers: {[key:string]: boolean};
    gameCode: string;
    isGameOver:boolean;
    hostID: string;
    numAlive: number;
    
    playerCodes: {[key:string]: number};
    roleCounts: number[];
    isDayOver: boolean;
    teams: Player[][];
    votesToEndDay: number;
    mafiaVote: number[];
    playerMarkedForDeath: Player | null;
    dayNum: number;
    gamePhase: GamePhase;
    nightLengthInMilliseconds: number;
    messageTime: number;
    openingMessageTime: number;
    constructor(gameCode: string)
    {
        const enumSize = Object.values(Role).filter(v => typeof v === "number").length;
        this.roleCounts = Array(enumSize).fill(0);
        this.roleCounts[Role.KILLER] = 1;
        this.roleCounts[Role.DETECTIVE] = 1;
        this.roleCounts[Role.DOCTOR] = 0;
        this.roleCounts[Role.FRAMER] = 0;
        this.nightLengthInMilliseconds = 15000; //15 seconds
        this.timestamp = Date.now();
        this.gamePhase = GamePhase.LOBBY;
        this.dayNum = 0;
        this.playerMarkedForDeath = null;
        this.votesToEndDay = 0;
        this.teams = [[],[]];
        this.isDayOver = false;
        this.numAlive = 0;
        this.numPlayers = 0;
        this.maxPlayers = 10;
        this.minPlayers = 2;
        this.currentPlayer = 0;
        this.gameCode = gameCode;
        this.players = [];
        this.numPlayersEntered = 0;
        this.isGameStarted = false;
        this.enteredPlayers = {};
        this.isGameOver = false;
        this.hostID = "";
        this.mafiaVote = [];
        this.playerCodes = {};
        this.messageTime = 6000;
        this.openingMessageTime = 10000;
    }

    getPlayerIndex(key:string) : number
    {
        return this.playerCodes[key];
    }

    addNewPlayer(socket:WebSocket, name:string) : string
    {
        //find a unique length 3 string
        let playerID: string = generateRandomString(3);
        
        while(this.players[this.getPlayerIndex(playerID)])
        {
            playerID = generateRandomString(3);
        }
        this.playerCodes[playerID] = this.numPlayers;
        
        this.players[this.numPlayers] = new Player(socket, playerID, name);
        if(this.numPlayers == 0)
        {
            this.hostID = playerID;
            this.players[this.getPlayerIndex(playerID)].isHost = true;
        }
        
        this.numPlayers++;
        return playerID;
    }

    generateRoles(): void
    {
        let visited: boolean[] = Array(this.players.length).fill(false);

        for(let i:number = 0; i < this.roleCounts.length; i++)
        {
            for(let j:number = 0; j < this.roleCounts[i]; j++)
            {
                let randNum = Math.floor(Math.random() * this.players.length);
                while(visited[randNum])
                {
                    randNum = Math.floor(Math.random() * this.players.length);
                }
                if(randNum >= this.players.length || randNum < 0)
                {
                    throw new Error("random number is out of bounds in generateRoles().");
                }
                this.players[randNum].role = i as Role;
                visited[randNum] = true;
                if(i as Role == Role.KILLER || i as Role == Role.FRAMER)
                {
                    this.teams[Team.MAFIA].push(this.players[randNum]); 
                }
                else
                {
                    this.teams[Team.INNOCENT].push(this.players[randNum]);
                }
            }
        }
    }

    setupGame(): void
    {
        const enumSize = Object.values(Role).filter(v => typeof v === "number").length;
        
        let nonBystanderCount = 0;
        for(let i = 0; i < this.roleCounts.length; i++)
        {
            if(i as Role != Role.BYSTANDER)
            {
                nonBystanderCount += this.roleCounts[i];
            }
        }
        this.roleCounts[Role.BYSTANDER] = this.numPlayers - nonBystanderCount;
        this.teams = [[],[]];
        this.generateRoles();
        this.resetVotes();
        this.playerMarkedForDeath = null;
        this.dayNum = 0;
        this.isDayOver = false;
        this.numPlayers = this.players.length;
        this.numAlive = this.numPlayers;
        this.gamePhase = GamePhase.GAME_START;
        
        this.isGameStarted = true;
    }
    setupNight(): void
    {
        this.playerMarkedForDeath = null;
        this.isDayOver = true;
        this.resetVotes();
        
        for(let player of this.players)
        {
            player.isHealed = false;
            player.isFramed = false;
            player.isMarkedForDeath = false;
            player.playerSelectedToInvestigate = -1;
            player.votedFor = -1;
        }
    }
    setupDay(): void
    {
        this.isDayOver = false;
        this.resetVotes();
        this.dayNum++;
    }

    choosePlayerFromMafiaVote()
    {
        
        //Find out who the mafia voted to kill
        //If there is a tie, choose randomly between the tied players
        let maxVotes = 0;
        let targets: number[] = [];
        for(let i = 0; i < this.mafiaVote.length; i++)
        {
            if(!this.players[i].isAlive) continue;
            let votes = this.mafiaVote[i];
            if(votes > maxVotes)
            {
                targets = [];
                targets.push(i);
                maxVotes = votes;
            } 
            else if(votes == maxVotes && votes > 0)
            {
                targets.push(i);
            }
        }
        console.log(targets.map(target => target));
        //choosing random player to die from list
        let targetPlayer: Player | null = null;
        if(targets.length > 0)
        {
            let randIndex = Math.floor(Math.random() * targets.length);
            targetPlayer = this.players[targets[randIndex]];
            targetPlayer.isMarkedForDeath = true;
            this.playerMarkedForDeath = targetPlayer;
        }
    }
    sendNightResultMessages(): void
    {
        console.log("Sending night result messages");
        let i = -1;
        for(let player of this.players)
        {
            i++;
            if(!player.isAlive) continue;
            let msg: any = {};
            msg.type = "message";
            if(player.isMarkedForDeath && player.isHealed)
            {
                msg.message2 = "You were viciously attacked in the dead of the night. Luckily, the town doctor was nearby, and they nursed you back to health.";
            }
            if(player.isMarkedForDeath && !player.isHealed)
            {
                msg.message = "You were viciously attacked in the dead of the night. You feel your life slipping away...";
            }
            else if(player.votedFor === undefined)
            {
                console.warn(`Player.votedFor is undefined in game.sendNightResultMessages for player ${i}`);
                msg.message = "Nothing happened during your nightly routine.";
            }
            else if(this.players[player.votedFor] === undefined && player.votedFor >= 0 && player.votedFor < this.players.length)
            {
                console.warn(`Player.votedFor is in bounds but undefined for player ${i}`);
                msg.message = "Nothing happened during your nightly routine.";
            }
            else if(player.role == Role.DETECTIVE)
            {
                if(player.votedFor < 0 || player.votedFor >= this.players.length)
                {
                    msg.message = "You did not investigate anyone last night.";
                }
                else
                {
                    let target = this.players[player.votedFor];
                    if(target.isFramed || target.role == Role.KILLER || target.role == Role.FRAMER)
                    {
                        msg.message = `After investigating last night, it's clear that ${target.name} is guilty as sin.`;
                    }
                    else
                    {
                        msg.message = `After investigating last night, it's clear that ${target.name} is not a member of the mafia.`;
                    }
                }
            }
            else if (player.role == Role.DOCTOR)
            {
                if(player.votedFor < 0 || player.votedFor >= this.players.length)
                {
                    msg.message = "You did not heal anyone last night.";
                }
                else if(this.players[player.votedFor].isMarkedForDeath)
                {
                    msg.message = `When checking up on ${this.players[player.votedFor].name} last night, you found them greviously wounded, but you nursed them back to health.`;
                }
                else
                {
                    msg.message = `Nothing was out of the ordinary when you checked up on ${this.players[player.votedFor].name}.`;
                }
            }
            else if(player.role == Role.FRAMER)
            {
                if(player.votedFor < 0 || player.votedFor >= this.players.length)
                {
                    msg.message = "You did not frame anyone last night.";
                }
                else
                {
                    msg.message = `You planted damning evidence in ${this.players[player.votedFor].name}'s home last night. If anyone snooped on them tonight, they'll see it.`;
                }
            }
            else if(this.playerMarkedForDeath !== null && player.role == Role.KILLER && this.playerMarkedForDeath.isHealed)
            {
                msg.message = `You paid ${this.playerMarkedForDeath.name} a visit last night.`;
            }
            else if(this.playerMarkedForDeath !== null && player.role == Role.KILLER)
            {
                msg.message = `You paid ${this.playerMarkedForDeath.name} a visit last night.`;
            }
            else if(player.role == Role.KILLER)
            {
                msg.message = "You did not kill anyone last night.";
            }
            else if(!player.isMarkedForDeath)
            {
                msg.message = "Nothing eventful happened in your nightly routine.";
            }
            player.socket.send(JSON.stringify(msg));
        }
    }
    /**Choose which player will be killed, and Will send a message to each player depending on what happened to them last night. */
    endNight(): void
    {
        this.gamePhase = GamePhase.NIGHT_END;
        for(let player of this.players)
        {
            if(player.role == Role.DOCTOR && this.players[player.votedFor] !== undefined)
            {
                this.players[player.votedFor].isHealed = true;
            }
            else if(player.role == Role.FRAMER && this.players[player.votedFor] !== undefined)
            {
                this.players[player.votedFor].isFramed = true;
            }
        }
        this.choosePlayerFromMafiaVote();
        //Give morning message to each player
        this.sendNightResultMessages();
        this.killPlayerMarkedForDeath();
        const timeoutID = setTimeout( () => 
        {
            this.gamePhase = GamePhase.DAY_START;
            if(this.playerMarkedForDeath != null && !this.playerMarkedForDeath.isHealed)
            {
                this.sendPlayerDeathMessages();
            }
            else
            {
                this.sendNoDeathMessages();
            }

            const nestedTimeoutID = setTimeout( () => 
            {
                this.handleStartDay();
            }, this.messageTime);
        }, this.messageTime);
    }

    killPlayerMarkedForDeath() : void
    {
        //kill the player marked for death
        if(this.playerMarkedForDeath != null && !this.playerMarkedForDeath.isHealed)
        {
            this.playerMarkedForDeath.isAlive = false;
            this.numAlive--;
        }
    }

    sendPlayerDeathMessages() : void
    {
        for(let player of this.players)
        {
            let msg: any = {};
            msg.type = "message";
            msg.message = `${this.playerMarkedForDeath?.name} was found dead in their home this morning.`;
            msg.message2 = `They were ${roleToString[this.playerMarkedForDeath?.role as number]}.`
            player.socket.send(JSON.stringify(msg));
        }
    }

    sendNoDeathMessages() : void
    {
        for(let player of this.players)
        {
            let msg: any = {};
            msg.type = "message";
            msg.message = "No one was killed last night.";
            player.socket.send(JSON.stringify(msg));
        }
    }

    sendMessageToClient(ws: WebSocket, type: string, message: any) : void
    {
        return ws.send(JSON.stringify({type:type, message:message}));
    }
    //TODO: shouldnt build this list everytime, keep running tally
    getPlayerList(includeEndDay: boolean) : any 
    {
        let list: any = {};
        list.names = this.players.map(player => player.name);
        list.alive = this.players.map(player => player.isAlive);
        list.votes = this.players.map(player => player.votesAgainst);
        if(includeEndDay)
        {
            list.alive.push(true);
            list.names.push("End Day");
            list.votes.push(this.votesToEndDay);
        }
        return list;
    }

    resetVotes() : void
    {
        this.mafiaVote = Array(this.players.length).fill(0);
        this.votesToEndDay = 0;
        for(let player of this.players)
        {
            player.votedFor = -1;
            player.votesAgainst = 0;
        }
    }

    sendMessageToAllPlayers(msg: string) : void
    {
        for(const player of this.players)
        {
            player.socket.send(msg);
        }
    }

    //returns -1 if no one has won yet, 0 if innocents win, 1 if mafia wins, 2 if nobody wins
    whoWon(): number
    {
        console.log(this.teams.map(team => team.map(player => player.name)));
        //TODO: fix this nonsense
        //If no one is alive, somehow, then nobody wins
        if(this.numAlive == 0)
        {
            return Team.NOBODY;
        }
        let mafiaLoss = true;
        //check to see if all mafia are dead
        for(let mafioso of this.teams[Team.MAFIA])
        {
            if(mafioso.isAlive)
            {
                mafiaLoss = false;
                break;
            }
        }
        if(mafiaLoss)
        {
            return Team.INNOCENT;
        }

        //check to see if all innocent are dead
        let innocentLoss = true;
        for(let inno of this.teams[Team.INNOCENT])
        {
            if(inno.isAlive)
            {
                innocentLoss = false;
                break;
            }
        }
        if(innocentLoss)
        {
            return Team.MAFIA;
        }
        return -1;
    }

    //{name1} {action} {name2 (optional)}
    //importance: 0 = normal, 1 = important, 2 = very important
    sendLogMessage(ws: WebSocket, name1: string, action:string, importance: number = 0, name2:string = ""): void
    {
        let msg: any = {};
        msg.type = "log_message";
        msg.name1 = name1;
        msg.action = action;
        msg.name2 = name2;
        msg.importance = importance;
        
        ws.send(JSON.stringify(msg));
        return;
    }
    //For a target player X, sends the amount of votes player X has to all clients
    broadcastVoteCountChange(targetID: number, newVoteCount: number): void
    {
        let returnMsg: any = {};
        returnMsg.type = "vote_count_change";
        returnMsg.target = targetID;
        returnMsg.votes = newVoteCount;
        //send new vote count of target player to all players
        for(let player of this.players)
        {
            player.socket.send(JSON.stringify(returnMsg));
        }
        return;
    }

    //For a target player X, sends the amount of votes player X has to all mafia clients
    broadcastMafiaVoteCountChange(targetID: number, newVoteCount: number)
    {
        let returnMsg: any = {};
        returnMsg.type = "vote_count_change";
        returnMsg.target = targetID;
        returnMsg.votes = newVoteCount;
        //send new vote count of target player to mafia players
        for(let player of this.teams[Team.MAFIA])
        {
            player.socket.send(JSON.stringify(returnMsg));
        }
        return;
    }

    //Tells client they cant vote for any player, except for the player they previously voted for to rescind that vote
    sendCanRescindToClient(targetID:number, ws:WebSocket, canEndDay: boolean)
    {
        let voteState: number[] = [];
        for(let i = 0; i < this.players.length; i++)
        {
            voteState.push(0);
        }
        if(canEndDay)
        {
            voteState.push(0);
        }
        voteState[targetID] = 1;
        let msg22: any = {};
        msg22.type = "can_vote_change";
        msg22.voteMessage = "Rescind";
        msg22.state = voteState.join("");
        ws.send(JSON.stringify(msg22));
        return;
    }

    //tells client they can vote for any player except themselves and any dead player
    sendOpenVoteListToClient(playerID: number, ws: WebSocket, voteMessage: string, canEndDay: boolean)
    {
        let voteState: number[] = [];
        for(let i = 0; i < this.players.length; i++)
        {
            if(!this.players[i].isAlive)
            {
                voteState.push(0);
            }
            else
            {
                voteState.push(1);
            }
        }
        //For end day vote
        if(canEndDay)
        {
            voteState.push(1);
        }
        voteState[playerID] = 0;
        let msg22: any = {};
        msg22.type = "can_vote_change";
        msg22.voteMessage = voteMessage;
        msg22.state = voteState.join("");
        ws.send(JSON.stringify(msg22));
        return;
    }

    //tells client they can vote any player, including dead players and themselves
    sendFullVoteListToClient(ws: WebSocket, voteMessage: string, canEndDay:boolean)
    {
        let voteState: number[] = [];
        for(let i = 0; i < this.players.length; i++)
        {
            voteState.push(1);
        }
        if(canEndDay)
        {
            voteState.push(1);
        }
        let msg22: any = {};
        msg22.type = "can_vote_change";
        msg22.voteMessage = voteMessage;
        msg22.state = voteState.join("");
        ws.send(JSON.stringify(msg22));
        return;
    }

    //tells client they cannot vote for any player
    sendClosedVoteListToClient(ws: WebSocket, voteMessage: string, canEndDay:boolean)
    {
        let voteState: number[] = [];
        for(let i = 0; i < this.players.length; i++)
        {
            voteState.push(0);
        }
        if(canEndDay)
        {
            voteState.push(0);
        }
        let msg22: any = {};
        msg22.type = "can_vote_change";
        msg22.voteMessage = voteMessage;
        msg22.state = voteState.join("");
        ws.send(JSON.stringify(msg22));
        return;
    }

    //Tell client they can vote for any alive character who is not part of the mafia team
    sendMafiaVoteListToClient(ws: WebSocket, voteMessage: string, canEndDay:boolean)
    {
        let voteState: number[] = [];
        for(let i = 0; i < this.players.length; i++)
        {
            if(!this.players[i].isAlive || this.players[i].role == Role.FRAMER || this.players[i].role == Role.KILLER)
            {
                voteState.push(0);
            }
            else
            {
                voteState.push(1);
            }
        }
        if(canEndDay)
        {
            voteState.push(1);
        }
        let msg22: any = {};
        msg22.type = "can_vote_change";
        msg22.voteMessage = voteMessage;
        msg22.state = voteState.join("");
        ws.send(JSON.stringify(msg22));
        return;
    }

    handleVoteHangPlayer(data: any, ws: WebSocket): void
    {
        let voter:Player = this.players[this.getPlayerIndex(data.voterID)];
        let target:Player = this.players[data.targetID];

        //process the vote
        voter.votedFor = data.targetID;
        target.votesAgainst++;

        //check to see if the new vote means the target player has a majority of votes
        let ratio: number = target.votesAgainst / this.numAlive;
        const EPSILON = 1e-10;
        for(let player of this.players)
        {
            this.sendLogMessage(player.socket, voter.name, "votes to hang", 0, target.name);
        }

        /////PLAYER IS HANGED///////
        if(ratio >= 0.5 + EPSILON) 
        {
            
            return this.handleHangPlayer(target);
        }

        //////NO PLAYER WAS HANGED///////
        
        this.broadcastVoteCountChange(data.targetID, target.votesAgainst);
        this.sendCanRescindToClient(data.targetID,ws, true);
        return;
    }

    handleRescindHangPlayer(data: any, ws:WebSocket): void
    {
        let voter:Player = this.players[this.getPlayerIndex(data.voterID)];
        let target:Player = this.players[data.targetID];

        //process the vote
        voter.votedFor = -1;
        target.votesAgainst--;
        for(let player of this.players)
        {
            this.sendLogMessage(player.socket, voter.name, "changed their mind about hanging", 0, target.name);
        }
        this.broadcastVoteCountChange(data.targetID, target.votesAgainst);
        this.sendOpenVoteListToClient(this.getPlayerIndex(data.voterID),ws,"Vote",true);
        return;
    }
    
    handleVoteEndDay(data:any, ws:WebSocket):void
    {
        let voter: Player = this.players[this.getPlayerIndex(data.voterID)];

        //process vote
        this.votesToEndDay++;
        voter.votedFor = this.players.length;

        //check to see if the new vote means that majority of players want to end day
        let ratio: number = this.votesToEndDay / this.numAlive;
        const EPSILON = 1e-10;
        for(let player of this.players)
        {
            this.sendLogMessage(player.socket, voter.name, "votes to end the day", 0);
        }
        ////DAY WILL NOT END/////
        //Majority of players haven't voted to end day
        if(ratio < 0.5 + EPSILON)
        {
            this.broadcastVoteCountChange(data.targetID, this.votesToEndDay);
            this.sendCanRescindToClient(data.targetID,ws,true);
            return;
        }
        /////DAY WILL END///////
        this.handleEndDay();
    }

    handleRescindEndDay(data: any, ws: WebSocket): void
    {
        let voter: Player = this.players[this.getPlayerIndex(data.voterID)];

        //process vote
        this.votesToEndDay--;
        voter.votedFor = -1;
        for(let player of this.players)
        {
            this.sendLogMessage(player.socket, voter.name, "changed their mind about ending the day", 0);
        }
        this.broadcastVoteCountChange(data.targetID, this.votesToEndDay);
        this.sendOpenVoteListToClient(this.getPlayerIndex(data.voterID),ws,"Vote",true);
        return;
    }

    handleNightVoteKiller(data: any, ws: WebSocket): void
    {
        let voter = this.players[this.getPlayerIndex(data.voterID)];
        let target = this.players[data.targetID];
        //ensure that this player is not mafia
        if(target.role == Role.FRAMER || target.role == Role.KILLER)
        {
            return returnErrorToWs(ws, "You cannot kill your team member.");
        }
        this.mafiaVote[data.targetID]++;
        voter.votedFor = data.targetID;

        for(let mafioso of this.teams[Team.MAFIA])
        {
            this.sendLogMessage(mafioso.socket, voter.name, "wants to kill", 0, target.name);
        }

        this.broadcastMafiaVoteCountChange(data.targetID, this.mafiaVote[data.targetID]);
        this.sendCanRescindToClient(data.targetID,ws,false);
    }

    handleNightRescindKiller(data: any, ws: WebSocket)
    {
        let voter:Player = this.players[this.getPlayerIndex(data.voterID)];
        let target:Player = this.players[data.targetID];

        //process the vote
        voter.votedFor = -1;
        this.mafiaVote[data.targetID]--;
        for(let mafioso of this.teams[Team.MAFIA])
        {
            this.sendLogMessage(mafioso.socket, voter.name, "changed their mind about killing", 0, target.name);
        }
        this.broadcastMafiaVoteCountChange(data.targetID, this.mafiaVote[data.targetID]);
        this.sendOpenVoteListToClient(this.getPlayerIndex(data.voterID),ws,"Kill",true);
        return;
    }

    handleNightVote(data: any, ws: WebSocket)
    {
        let voter:Player = this.players[this.getPlayerIndex(data.voterID)];
        let target:Player = this.players[data.targetID];

        //if player is not a killer, mark who they voted for and send new vote list to only them
        if(voter.role != Role.KILLER)
        {
            this.sendLogMessage(voter.socket, "You", `decided to ${roleToAction[voter.role].toLowerCase()}`, 0, target.name);
            voter.votedFor = data.targetID;
            this.sendCanRescindToClient(data.targetID,ws,false);
        }
        else
        {
            this.handleNightVoteKiller(data,ws);
        }
    }

    handleNightRescind(data: any, ws: WebSocket)
    {
        let voter:Player = this.players[this.getPlayerIndex(data.voterID)];
        let target:Player = this.players[data.targetID];

        //if player is not a killer, mark who they voted for and send new vote list to only them
        if(voter.role == Role.KILLER)
        {
            this.handleNightRescindKiller(data,ws);
        }
        else if(voter.role == Role.BYSTANDER)
        {
            voter.votedFor = -1;
            let voteMessage = roleToAction[voter.role as number];
            this.sendLogMessage(voter.socket, "You", `decided not to ${roleToAction[voter.role].toLowerCase()}`, 0, target.name);
            this.sendFullVoteListToClient(ws,voteMessage,false);
        }
        else
        {
            voter.votedFor = -1;
            let voteMessage = roleToAction[voter.role as number];
            this.sendLogMessage(voter.socket, "You", `decided not to ${roleToAction[voter.role].toLowerCase()}`, 0, target.name);
            this.sendOpenVoteListToClient(this.getPlayerIndex(data.voterID),ws,voteMessage,false);
        }
    }

    handleHangPlayer(target: Player) : void
    {
        this.numAlive--;
        console.log(target.name + " is to be hanged.");
        //player has majority of votes and will be hanged
        this.isDayOver = true;
        target.isAlive = false;
        let payload: any = {};
        payload.type = "player_hanged";
        payload.role = `They were ${roleToString[target.role]}.`;
        payload.message = `${target.name} was hung from the neck until they were dead.`;
        this.sendMessageToAllPlayers(JSON.stringify(payload));
        //send log message to all players
        for(let player of this.players)
        {
            this.sendLogMessage(player.socket, target.name, "was hung by the town", 2);
            this.sendLogMessage(player.socket, target.name, `was ${roleToString[target.role]}`, 2);
        }
        //check to see if any team won after that
        let result = this.whoWon();
        //if not, set an interval to start the next night.
        if(result < 0)
        {
            this.gamePhase = GamePhase.DAY_END;
            const id = setTimeout( () =>
            {
                this.handleStartNight();
                
            } ,this.messageTime);
            return;
        }
        //If a team did win, set an interval to show game over screen
        else
        {
            const id = setTimeout ( () => 
            {
                this.gamePhase = GamePhase.GAME_OVER;
                let gameOverMsg: any = {};
                gameOverMsg.type = "game_over";
                gameOverMsg.winner = Team[result];
                gameOverMsg.members = [];
                for(let mafioso of this.teams[Team.MAFIA])
                {
                    gameOverMsg.members.push(mafioso.name);
                }
                return this.sendMessageToAllPlayers(JSON.stringify(gameOverMsg));
            }, this.messageTime);
        }
        return;
    }
    handleEndDay()
    {
        //Majority of players want day to end
        this.isDayOver = true;
        let payload: any = {};
        payload.type = "player_hanged";
        payload.role = `Everybody returns to their houses for the night.`;
        payload.message = `The majority of townsmembers elect not to hang anybody today.`;
        this.sendMessageToAllPlayers(JSON.stringify(payload));
        for(let player of this.players)
        {
            this.sendLogMessage(player.socket, "", "The town decided not to hang anyone today.", 0);
        }
        this.gamePhase = GamePhase.DAY_END;
        //Set interval to start night after a time
        const id = setTimeout( () =>
        {
            this.handleStartNight();
        } ,this.messageTime);
    }
    handleStartDay()
    {
        let result = this.whoWon();
        if(result >= 0)
        {
            let gameOverMsg: any = {};
            gameOverMsg.type = "game_over";
            gameOverMsg.winner = Team[result];
            gameOverMsg.members = [];
            for(let mafioso of this.teams[Team.MAFIA])
            {
                gameOverMsg.members.push(mafioso.name);
            }
            return this.sendMessageToAllPlayers(JSON.stringify(gameOverMsg));
        }
        this.gamePhase = GamePhase.DAY_VOTE;
        this.setupDay();
        let list = this.getPlayerList(true);
        list.type = "day_start";
        list.dayNum = this.dayNum;
        list.votesToEndDay = this.votesToEndDay;
        let i = 0;
        for(let player of this.players)
        {
            this.sendLogMessage(player.socket, `Day ${this.dayNum}`, ``, 1);
            if(this.playerMarkedForDeath != null && !this.playerMarkedForDeath.isHealed)
            {
                this.sendLogMessage(player.socket, this.playerMarkedForDeath?.name as string, "was murdered by the mob.", 2);
                this.sendLogMessage(player.socket, this.playerMarkedForDeath?.name as string, "was", 2, roleToString[this.playerMarkedForDeath?.role as number]);
            }
            player.socket.send(JSON.stringify(list));
            if(player.isAlive)
                this.sendOpenVoteListToClient(i, player.socket, "Vote", true);
            else
                this.sendClosedVoteListToClient(player.socket, "Vote", true);
            i++;
        }
    }
    handleStartNight()
    {
        
        this.setupNight();
        let nightMsg: any = {};
        nightMsg = this.getPlayerList(false);
        nightMsg.type = "new_vote";
        nightMsg.header = `Night ${this.dayNum}`;
        nightMsg.showVotes = false;
        this.timestamp = Date.now() + this.nightLengthInMilliseconds;
        nightMsg.timeToEnd = this.timestamp;
        this.gamePhase = GamePhase.NIGHT_VOTE;
        for(let i = 0; i < this.players.length; i++)
        {
            let player = this.players[i];
            this.sendLogMessage(player.socket, `Night ${this.dayNum}`, ``, 1);
            nightMsg.description = roleToNightDescription[player.role];
            
            if(!player.isAlive)
            {
                nightMsg.description = "You are dead.";
            }
            if(player.role == Role.BYSTANDER && player.isAlive)
            {
                let randIndex = Math.floor(Math.random() * nightQuestions.length);
                nightMsg.description2 = nightQuestions[randIndex];
            }
            else if(player.role == Role.KILLER || player.role == Role.FRAMER)
            {
                nightMsg.description2 = "The mafia team: " + this.teams[Team.MAFIA].map(mafioso => `${mafioso.name}: ${Role[mafioso.role]}`).join(", ");
                //get rid of last comma
                if(nightMsg.description2.endsWith(", "))
                {
                    nightMsg.description2 = nightMsg.description2.slice(0, -2);
                }
            }
            else
            {
                if("description2" in nightMsg)
                {
                    delete nightMsg.description2;
                }
            }
            player.socket.send(JSON.stringify(nightMsg));
            if(!player.isAlive)
            {
                this.sendClosedVoteListToClient(player.socket, roleToAction[player.role], false);
            }
            else if(player.role == Role.KILLER || player.role == Role.FRAMER)
            {
                this.sendMafiaVoteListToClient(player.socket, roleToAction[player.role], false);
            }
            else if(player.role == Role.BYSTANDER)
            {
                this.sendFullVoteListToClient(player.socket, "Choose", false);
            }
            else
            {
                this.sendOpenVoteListToClient(i, player.socket, roleToAction[player.role], false);
            }
        }
        const timeoutID = setTimeout( () => 
        {
            this.endNight();
        }, this.nightLengthInMilliseconds);
    }

    sendDayDataToClient(player: Player)
    {
        if(this.players.indexOf(player) < 0)
        {
            throw new Error("Player not found in game.");
        }
        let list = this.getPlayerList(true);
        list.type = "day_start";
        list.dayNum = this.dayNum;
        list.votesToEndDay = this.votesToEndDay;
        player.socket.send(JSON.stringify(list));
        if(!player.isAlive)
        {
            this.sendClosedVoteListToClient(player.socket, "Vote", true);
        }
        else if(player.votedFor > -1 && player.votedFor <= this.players.length)
        {
            this.sendCanRescindToClient(player.votedFor, player.socket, true);
        }
        else
        {
            this.sendOpenVoteListToClient(this.players.indexOf(player), player.socket, "Vote", true);
        }
    }
    sendNightDataToClient(player: Player)
    {
        if(this.players.indexOf(player) < 0)
        {
            throw new Error("Player not found in game.");
        }
        let list = this.getPlayerList(false);
        list.type = "new_vote";
        list.header = `Night ${this.dayNum}`;
        list.showVotes = false;
        list.timeToEnd = this.timestamp;
        list.description = roleToNightDescription[player.role];
        
        if(player.role == Role.KILLER || player.role == Role.FRAMER)
        {
            list.description2 = "The mafia team: " + this.teams[Team.MAFIA].map(mafioso => `${mafioso.name}: ${Role[mafioso.role]}`).join(", ");
            //get rid of last comma
            if(list.description2.endsWith(", "))
            {
                list.description2 = list.description2.slice(0, -2);
            }
        }
        else if(player.role == Role.BYSTANDER && player.isAlive)
        {
            let randIndex = Math.floor(Math.random() * nightQuestions.length);
            list.description2 = nightQuestions[randIndex];
        }
        else if("description2" in list)
        {
            delete list.description2;
        }
        player.socket.send(JSON.stringify(list));

        if(player.votedFor > -1 && player.votedFor <= this.players.length)
        {
            this.sendCanRescindToClient(player.votedFor, player.socket, false);
        }
        else
        {
            if(!player.isAlive)
            {
                this.sendClosedVoteListToClient(player.socket, roleToAction[player.role], false);
            }
            else if(player.role == Role.KILLER || player.role == Role.FRAMER)
            {
                this.sendMafiaVoteListToClient(player.socket, roleToAction[player.role], false);
            }
            else if(player.role == Role.BYSTANDER)
            {
                this.sendFullVoteListToClient(player.socket, "Choose", false);
            }
            else
            {
                this.sendOpenVoteListToClient(this.players.indexOf(player), player.socket, roleToAction[player.role], false);
            }
        }
    }

    sendOptionsDataToClient(ws: WebSocket)
    {
        //compile a dictionary of the options
        //roles[]
        //  roles[i]:
        //      name:[name_of_role]
        //      count:[how_many_of_role]
        //      id:   [unique_id_specifying_role]
        let roles: any[] = [];
        for(let i = 0; i < this.roleCounts.length; i++)
        {
            if(i as Role != Role.BYSTANDER)
            {
                let role: any = {};
                role.name = Role[i];
                role.count = this.roleCounts[i];
                role.id = i;
                roles.push(role);
            }
        }
        let msg : any = 
        {
            roles: roles,
            type: "options"
        };
        return ws.send(JSON.stringify(msg));
    }

    //TODO: this is quite insecure
    setOptions(ws:WebSocket, roles: any[])
    {
        console.log("changing role counts...");
        //compile a dictionary of the options
        //roles[]
        //  roles[i]:
        //      count:[how_many_of_role]
        //      id:   [unique_id_specifying_role]
        for(let i = 0; i < roles.length; i++)
        {
            
            let role: any = roles[i];
            this.roleCounts[role.id] = role.count;
            console.log(`${Role[role.id]} count is now: ${role.count}`);
        }
        //send success message to client
        let msg: any = {};
        msg.type = "options_set_success";
        ws.send(JSON.stringify(msg));
    }
}

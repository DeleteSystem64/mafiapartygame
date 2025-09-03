
const playerID = localStorage.getItem("playerID");
const playerListDiv = document.getElementById("playerList");
const gameCode = new URLSearchParams(window.location.search).get("gameID");
const ip = "localhost:3000";
let welcomeMsg = document.getElementById("welcomeMsg");
const ws = new WebSocket('wss://' + "mafiapartygame.com");
const gameCodeMessage = document.getElementById("gameCodeMessage");
const genericContainer = document.getElementById("genericContainer");

//let votedFor

function startTimer(timeToEnd) 
{
    const timerDiv = document.getElementById("timer");
    show(timerDiv);
    function updateTimer() 
    {
        const now = Date.now();
        let secondsLeft = Math.max(0, Math.floor((timeToEnd - now) / 1000));
        timerDiv.textContent = `Time left: ${secondsLeft}s`;
        if (secondsLeft <= 0) 
        {
            clearInterval(intervalId);
            timerDiv.textContent = "Time's up!";
            hide(timerDiv);
        }
    }
    updateTimer(); // Initial call
    const intervalId = setInterval(updateTimer, 1000);
}

function vote(id)
{
    let msg = {};
    msg.type = "vote";
    msg.voterID = playerID;
    msg.targetID = id;
    msg.gameID = gameCode;
    ws.send(JSON.stringify(msg));
}

function updateVoteCount(targetID, voteCount)
{
    document.getElementById(`votes${targetID}`).innerText = voteCount;
}

function updateVoteButtons(buttonMessage, state)
{
    for(let i = 0; i < state.length; i++)
    {
        let buttonContainer = document.getElementById(`voteButtonContainer${i}`);
        //we CAN vote for this player
        if(state[i] == '1')
        {
            show(buttonContainer);
            buttonContainer.innerHTML = `<button onclick=vote(${i})> ${buttonMessage} </button></td>`
        }
        //we CANNOT vote for this player
        else
        {
            //hide(buttonContainer);
            buttonContainer.innerHTML = ``;
        }
    }
}

//TODO:Don't re-render entire list after a vote, just update certain elements
function renderVoteList(data)
{
    let names = data.names;
    let alive = data.alive;
    let votes = data.votes;
    let showVotes;
    if("showVotes" in data)
    {
        showVotes = data.showVotes;
    }
    else
    {
        showVotes = true; //default to true
    }

    let html = "<table>";
    html += "<thead><tr> <th>Name</th>";
    if(showVotes)
        html += "<th>Votes</th>";;
        
    html += "<th> </th> </tr></thead>";
    html += "<tbody>";
    for(let i = 0; i < data.names.length; i++)
    {
        html += "<tr>";
        html += "<td>" + names[i] + "</td>";
        
        //Votes: Show votes if showVotes is true and player is alive
        //If player is dead, show empty cell
        //If showVotes is false, don't even include the cell
        if (showVotes && alive[i])
        {
            html += `<td id=votes${i}> ${votes[i]} </td>`;
        }
        else if(showVotes && !alive[i])
        {
            html += "<td>DEAD</td>";
        }
        html += `<td id="voteButtonContainer${i}"> <button onclick=vote(${i})> Vote </button></td>`; 
        
        html += "</tr>";
    }
    html += "</tbody>";
    html += "</table>";
    genericContainer.innerHTML = html;

    //hide vote buttons for dead players (maybe)
}

//{name1} {action} {name2 (optional)}
//importance: 0 = normal, 1 = important, 2 = very important
function addToLog(name1, action,importance = 0, name2 = "")
{
    
    let logContainer = document.getElementById("logContainer");
    let shouldScroll = logContainer.scrollTop + logContainer.clientHeight >= logContainer.scrollHeight - 2;
    
    let entry = document.createElement("div");
    entry.className = "log-entry";
    if (importance === 1) 
    {
        entry.classList.add("important");
    } 
    else if (importance === 2) 
    {
        entry.classList.add("very-important");
    }
    entry.innerHTML = `<b>${name1}</b> ${action} <b>${name2}</b>`;
    logContainer.appendChild(entry);
    if(shouldScroll)
        logContainer.scrollTop = logContainer.scrollHeight;
}

ws.onmessage = (event) => 
{
    const data = JSON.parse(event.data);
    if(data.error)
    {
        alert(data.error);
        return;
    }
    
    if(data.type === "player_join")
    {
        console.log(data);
        let playerListString = "<ol>";
        for(let i = 0; i < data.playerList.length; i++)
        {
            playerListString += "<li>" + data.playerList[i].name + "</li>";
        }
        playerListString += "</ol>";
        genericContainer.innerHTML = playerListString;

        if(data.host)
        {
            let bleh = "<button onclick = \"startGame()\"> Start Game </button>";
            let container = document.getElementById("startButtonContainer");
            show(container);
            show(document.getElementById("openOverlayButton"));
            container.innerHTML = bleh;
        }
    }
    else if(data.type === "game_start")
    {
        hide(document.getElementById("openOverlayButton"));
        //hide(playerListDiv);
        hide(document.getElementById("playerListHeader"));
        hide(document.getElementById("startButtonContainer"));
        hide(document.getElementById("genericDescription"));
        let html = "";
        html += `<div> ${data.role} </div> <div> ${data.ability}</div>`;
        if("team" in data)
        {
            html += `<div> ${data.team} </div>`;
        }
        document.getElementById("genericContainer").innerHTML = html;
        welcomeMsg.textContent = "The game has started..."; 
    }
    else if(data.type === "day_start")
    {
        hide(document.getElementById("openOverlayButton"));
        hide(document.getElementById("playerListHeader"));
        hide(document.getElementById("startButtonContainer"));
        hide(document.getElementById("genericDescription"));
        show(document.getElementById("welcomeMsg"));
        show(document.getElementById("logContainer"));
        
        renderVoteList(data);
        welcomeMsg.textContent = "Day " + data.dayNum;
    }
    else if(data.type === "new_vote")
    {
        hide(document.getElementById("openOverlayButton"));
        hide(document.getElementById("playerListHeader"));
        hide(document.getElementById("startButtonContainer"));
        show(document.getElementById("welcomeMsg"));
        show(document.getElementById("logContainer"));
        console.log(JSON.stringify(data));
        if("header" in data)
        {
            welcomeMsg.textContent = data.header;
        }
        else
        {
            hide(document.getElementById("welcomeMsg"));
        }
        if("description" in data)
        {
            show(document.getElementById("genericDescription"));
            if("description2" in data)
            {
                document.getElementById("genericDescription").textContent = data.description + " " + data.description2;
            }
            else
            {
                document.getElementById("genericDescription").textContent = data.description;
            }
        }
        else
        {
            hide(document.getElementById("genericDescription"));
        }
       
        startTimer(data.timeToEnd);
        renderVoteList(data);
    }
    else if(data.type === "vote_failure")
    {

    }
    else if(data.type === "player_hanged")
    {
        hide(document.getElementById("startButtonContainer"));
        let html = "";
        html += `<div>${data.message}</div>`;
        html += `<div>${data.role}</div>`;
        genericContainer.innerHTML = html;
        show(genericContainer);
    }
    else if(data.type === "game_over")
    {
        hide(document.getElementById("logContainer"));
        let html = "<div>The ";
        html += data.winner + " win!</div>";
        html += "<div>The mafia members were:";
        for(let i = 0; i < data.members.length; i++)
        {
            html += `<b>${data.members[i]}</b>, `;
        }
        html +=  "</div>"
        genericContainer.innerHTML = html;
    }
    else if(data.type === "vote_count_change")
    {
        updateVoteCount(data.target, data.votes);
    }
    else if(data.type === "can_vote_change")
    {
        updateVoteButtons(data.voteMessage, data.state);
    }
    else if(data.type === "message")
    {
        show(document.getElementById("logContainer"));
        hide(document.getElementById("startButtonContainer"));
        hide(document.getElementById("genericDescription"));
        hide(document.getElementById("playerListHeader"));
        hide(document.getElementById("welcomeMsg"));
        let html = "";
        if(data.message2 && data.message)
        {
            html += `<div>${data.message} ${data.message2}</div>`;
        }
        else if(data.message2)
        {
            html += `<div>${data.message2}</div>`;
        }
        else if(data.message)
        {
            html += `<div>${data.message}</div>`;
        }
        genericContainer.innerHTML = html;
    }
    else if(data.type === "log_message")
    {

        show(document.getElementById("logContainer"));
        if(data.name2 === undefined)
        {
            addToLog(data.name1, data.action, data.importance);
        }
        else
        {
            addToLog(data.name1, data.action, data.importance, data.name2);
        }
    }
    else if(data.type === "entire_log")
    {

    }
    else if(data.type === "options")
    {
        console.log(JSON.stringify(data));
        //compile a dictionary of the options
        //roles[]
        //  roles[i]:
        //      name:[name_of_role]
        //      count:[how_many_of_role]
        //      id:   [unique_id_specifying_role]
        let roles = data.roles;
        const parent = document.getElementById("optionsList");
        parent.innerHTML = "";
        for(let i = 0; i < roles.length; i++)
        {
            let role = roles[i];
            let el = document.createElement("div");
            el.id = `option${role.id}`;
            el.innerHTML = `${role.name}S: <input id="input${role.id}" type="number" value="${role.count}" min="0">`;
            parent.appendChild(el);
        }
    }
    else if(data.type === "options_set_success")
    {
        document.getElementById("sendOptionsButtonContainer").innerHTML = "Done!";
    }
};

let gameState = "         ";

ws.onopen = () =>
{
    ws.send(JSON.stringify({type:"enter_lobby", playerID: localStorage.getItem("playerID"), gameCode:gameCode}));
}

function startGame()
{
    ws.send(JSON.stringify({type:"start_requested",playerID:playerID, gameCode:gameCode}));
}

function hide(el)
{
    el.classList.add("hidden");
}
function show(el)
{
    el.classList.remove("hidden");
}
show(document.getElementById("playerListHeader"));
hide(document.getElementById("genericDescription"));
hide(document.getElementById("logContainer"));
hide(document.getElementById("openOverlayButton"));

console.log("PlayerID: " + localStorage.getItem("playerID"));

gameCodeMessage.innerHTML = "Game Code: " + gameCode;






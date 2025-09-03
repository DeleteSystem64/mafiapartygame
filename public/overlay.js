const closeButton = document.getElementById('closeButton');
const openButton = document.getElementById('openOverlayButton');
const overlay = document.getElementById("overlayMenu");
const sendOptionsButton = document.getElementById("sendOptionsButton");
hide(overlay);

closeButton.addEventListener('click', () => 
{
    hide(overlay);
});

openButton.addEventListener('click', () =>
{
    document.getElementById("sendOptionsButtonContainer").innerHTML = `<button id="sendOptionsButton" onclick="sendOptionsToServer()">CONFIRM</button>`;

    ws.send(JSON.stringify({type:"options_get",gameID:gameCode}));
    show(overlay);
});

function sendOptionsToServer() 
{
    const parent = document.getElementById("optionsList");
    //roles[]
        //  roles[i]:
        //      count:[how_many_of_role]
        //      id:   [unique_id_specifying_role]
    let roles = [];
    if(parent)
    {
        for(const child of parent.children)
        {
            const input = child.querySelector("input");
            if(input)
            {
                let role = {};
                role.count = input.value;
                role.id = input.id.match(/\d+/);
                roles.push(role);
            }
        }
    }
    document.getElementById("sendOptionsButtonContainer").innerHTML = "Sending role counts to server...";
    let msg = {};
    msg.gameID = gameCode;
    msg.type = "options_set";
    msg.roles = roles;
    ws.send(JSON.stringify(msg));
};
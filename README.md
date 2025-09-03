# Mafia Party Game Source code for a game application that implements the classic social deduction party game ['Mafia'](https://en.wikipedia.org/wiki/Mafia_(party_game)). Uses Node.js specific code, written in typescript. Visit [mafiapartygame.com](https://mafiapartygame.com) to play the game now. 
## Features 
- Lobby system which allows for many games to run at once
- Server which handles game logic, WebSocket connections, and serves front end
- Front-end UI which handles user interaction
## File Structure
<pre>
mafia-party-game/
├── lib/ # Enums and class files (game logic)
  ├── Game.ts
  ├── GamePhase.ts
  ├── Player.ts
  ├── Role.ts
  ├── Team.ts
├── public/ # Frontend HTML/CSS/JS
  ├── index.html
  ├── lobby.html
  ├── lobby.js
  ├── overlay.js
  ├── style.css
├── node_modules/ # Dependencies
├── server.ts # Main server file
├── package.json
└── README.md
</pre>
## Installation 
- download the files and place them in a new directory on your pc
- make sure you have npm installed, and run 'npm init -y'
- run 'tsc server.ts' to compile typescript files to javascript
- run 'node server.js' to start a local server

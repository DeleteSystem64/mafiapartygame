# Mafia Party Game 
This repository contains the source code for a game application that implements the classic social deduction party game ['Mafia'](https://en.wikipedia.org/wiki/Mafia_(party_game)). Written in TypeScript and designed to run in a Node.js environment. Visit [mafiapartygame.com](https://mafiapartygame.com) to play the game now. 
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
1. Clone the repository or download the ZIP 
2. Navigate to project directory
3. Install dependencies using
    ```npm install```
5. Compile Typescript using `tsc server.ts`
6. Start server with `node server.js`

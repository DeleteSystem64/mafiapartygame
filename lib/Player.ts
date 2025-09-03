import { Role } from './Role';
import WebSocket = require('ws');
export default class Player
{
    name:string;
    socket: WebSocket;
    role: Role;
    isAlive: boolean;
    isHost:boolean;
    key: string;
    votesAgainst: number;
    votedFor: number;
    isFramed: boolean;
    isHealed: boolean;
    playerSelectedToInvestigate: number;
    isMarkedForDeath: boolean;
    
    constructor(socket:WebSocket, key:string, name:string)
    {
        this.isMarkedForDeath = false;
        this.isHealed = false;
        this.playerSelectedToInvestigate = -1;
        this.isFramed = false;
        this.votesAgainst = 0;
        this.key = key;
        this.isHost = false;
        this.name = name;
        this.socket = socket;
        this.role = Role.BYSTANDER;
        this.isAlive = true;
        this.votedFor = -1;
        
    }
    
}
const { Server } = require("colyseus");
const room = require("./room");


const gameServer = new Server();


gameServer.define(
    "world",
    room
);


gameServer.listen(2567);


console.log("Server running");
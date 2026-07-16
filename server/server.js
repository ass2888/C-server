const { Server } = require("colyseus");
const room = require("./room");


const gameServer = new Server();


gameServer.define(
    "world",
    room
);


const PORT = process.env.PORT || 2567;

gameServer.listen(PORT);

console.log("Server running on", PORT);

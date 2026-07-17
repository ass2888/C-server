const { Server } = require("colyseus");
const classicRoom = require("./rooms");


const gameServer = new Server();
let waitingRooms = [];

gameServer.define(
    "ClassicMatch",
    classicRoom
);


const PORT = process.env.PORT || 2567;

gameServer.listen(PORT);

console.log("Server running on", PORT);

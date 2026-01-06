const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Default route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// Store connected players
const players = new Map();
let playerOrder = [];
let currentTurn = 0;

// Predefined spawn positions on the board
const spawnPositions = [
    { x: 1, y: 1 },
    { x: 16, y: 1 },
    { x: 1, y: 16 },
    { x: 16, y: 16 },
    { x: 9, y: 0 },
    { x: 0, y: 9 },
    { x: 17, y: 9 },
    { x: 9, y: 17 }
];

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Position update from clients
    socket.on('playerInfo', (data) => {
        const player = players.get(socket.id);

        if (player) {
            // Update stored position
            player.x = data.x;
            player.y = data.y;
            player.stepsleft = data.stepsleft;

            // Broadcast to all OTHER players
            socket.broadcast.emit('playerMoved', {
                socketId: socket.id,
                username: player.username,
                x: data.x,
                y: data.y
            });
        }
    });

    // Handle login
    socket.on('login', (data) => {
        console.log('User logged in:', data.username);

        // Assign a spawn based on join order
        const index = players.size % spawnPositions.length;
        const spawn = spawnPositions[index];

        // Store player info
        players.set(socket.id, {
            username: data.username,
            socketId: socket.id,
            x: spawn.x,
            y: spawn.y,
            spawnIndex: index
        });

        // Send confirmation back to client (with starting position)
        socket.emit('loginSuccess', {
            socketId: socket.id,
            username: data.username,
            x: spawn.x,
            y: spawn.y
        });

        // Send current players state to the newly joined client
        socket.emit('playersState', Array.from(players.values()).map(p => ({
            socketId: p.socketId,
            username: p.username,
            x: p.x,
            y: p.y
        })));

        // Notify other players
        socket.broadcast.emit('playerJoined', {
            username: data.username,
            socketId: socket.id,
            x: spawn.x,
            y: spawn.y
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            console.log('User disconnected:', player.username);
            players.delete(socket.id);

            // Notify other players
            socket.broadcast.emit('playerLeft', {
                username: player.username,
                socketId: socket.id
            });
        }
    });

    socket.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'rolldice':
                    rolldice(socket);
                    break;
                case 'startGame':
                    startGame(socket);
                    break;
            }
        } catch (error) {
            console.log("Invalid type");
        }
    });

    // Also support direct event for rolling dice
    socket.on('rolldice', () => {
        rolldice(socket);
    });
});

function startGame(socket) {
    // 1. Convert the Map of players into an array for the turn order
    playerOrder = Array.from(players.keys());

    // 2. Safety check: Don't start with 0 players
    if (playerOrder.length === 0) return;

    // 3. Randomize the player order to make it fair
    playerOrder = playerOrder.sort(() => Math.random() - 0.5);

    // 4. Set the current turn to the first player in the shuffled list
    currentTurn = 0;

    console.log("Game starting with order:", playerOrder.map(id => players.get(id).username));

    // 5. Emit to EVERYONE that the game has started and provide the initial state
    io.emit('gameStarted', {
        order: playerOrder.map(id => ({
            socketId: id,
            username: players.get(id).username
        })),
        activePlayer: playerOrder[currentTurn]
    });
}

function rolldice(socket) {
    // 1. Validation: Is it actually this player's turn?
    if (socket.id !== playerOrder[currentTurn]) {
        socket.emit('error_message', "It's not your turn!");
        return;
    }

    // 2. Generate the result on the server
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    // 3. Broadcast result to EVERYONE (including the roller)
    io.emit('diceRolled', {
        username: players.get(socket.id).username,
        d1: d1,
        d2: d2,
        socketId: socket.id
    });

    nextTurn();
}

function nextTurn() {
    if (playerOrder.length === 0) return;

    currentTurn = (currentTurn + 1) % playerOrder.length;
    const nextPlayerId = playerOrder[currentTurn];

    io.emit('turnUpdate', {
        activePlayerId: nextPlayerId,
        username: players.get(nextPlayerId).username
    });
}

// Start server
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

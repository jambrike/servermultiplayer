const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

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
    { x: 7 ,y: 7},
    { x: 9, y: 9},
    { x: 3, y: 5 },
    { x: 5, y: 9},
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

        // Check if this username is already in the game (reconnection)
        let existingPlayer = null;
        let oldSocketId = null;
        for (let [id, p] of players.entries()) {
            if (p.username === data.username) {
                existingPlayer = p;
                oldSocketId = id;
                break;
            }
        }

        if (existingPlayer) {
            // Reconnection - update socket ID
            console.log(`${data.username} reconnected with new socket ID`);
            players.delete(oldSocketId);
            existingPlayer.socketId = socket.id;
            players.set(socket.id, existingPlayer);
            
            // Update turn order if game has started
            const orderIndex = playerOrder.indexOf(oldSocketId);
            if (orderIndex !== -1) {
                playerOrder[orderIndex] = socket.id;
            }
        } else {
            // New player - assign a spawn based on join order
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
        }

        const playerData = players.get(socket.id);

        // Send confirmation back to client (with starting position)
        socket.emit('loginSuccess', {
            socketId: socket.id,
            username: playerData.username,
            x: playerData.x,
            y: playerData.y
        });

        // Send current players state to the newly joined client
        socket.emit('playersState', Array.from(players.values()).map(p => ({
            socketId: p.socketId,
            username: p.username,
            x: p.x,
            y: p.y
        })));

        // Notify other players (only if new player)
        if (!existingPlayer) {
            socket.broadcast.emit('playerJoined', {
                username: playerData.username,
                socketId: socket.id,
                x: playerData.x,
                y: playerData.y
            });
        }

        // If game has started, send current turn info
        if (playerOrder.length > 0) {
            socket.emit('gameStarted', {
                order: playerOrder.map(id => ({
                    socketId: id,
                    username: players.get(id) ? players.get(id).username : 'Unknown'
                })),
                activePlayer: playerOrder[currentTurn]
            });
        } else if (players.size >= 2) {
            // Auto-start when at least 2 players are present and no game running
            startGame(socket);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            console.log('User disconnected:', player.username, '(but may reconnect)');
            const idx = playerOrder.indexOf(socket.id);
            if (idx !== -1) {
                playerOrder.splice(idx, 1);
                if (currentTurn >= playerOrder.length) currentTurn = 0;
                if (playerOrder.length) {
                    io.emit('turnUpdate', {
                        activePlayerId: playerOrder[currentTurn],
                        username: players.get(playerOrder[currentTurn])?.username
                    });
                }
            }
            io.emit('playerLeft', {
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

    socket.on('endTurn', () => {
        if (socket.id !== playerOrder[currentTurn]) return;
        nextTurn();
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
    if (!solution) {
        solution = {
            suspect: randomFrom(suspects),
            weapon:  randomFrom(weapons),
            room:    randomFrom(rooms)
        };
    }

    io.emit('gameStarted', {
        order: playerOrder.map(id => ({
            socketId: id,
            username: players.get(id).username
        })),
        activePlayer: playerOrder[currentTurn],
        answer: solution
    });
}
const suspects = ["Janitor", "Aunt", "Chef", "James", "Butler", "Grandfather"];
const weapons  = ["knife", "candlestick", "revolver", "wrench", "rope"];
const rooms    = ["kitchen", "ballroom", "conservatory", "library", "study"];
let solution = null;
function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

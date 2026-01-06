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

// Store connected players by username
const players = new Map(); // Key: username, Value: { x, y, socketId, ... }
const socketToUser = new Map(); // Key: socketId, Value: username
let playerOrder = []; // Array of usernames in turn order
let currentTurn = 0;

// Predefined spawn positions on the board
const spawnPositions = [
    { x: 7, y: 7 },
    { x: 9, y: 9 },
    { x: 3, y: 5 },
    { x: 5, y: 9 },
    { x: 9, y: 0 },
    { x: 0, y: 9 },
    { x: 17, y: 9 },
    { x: 9, y: 17 }
];

const suspects = ["Gardener", "Aunt", "Chef", "Zach", "Banker", "Butler"];
const weapons = ["knife", "candlestick", "revolver", "wrench", "rope"];
const rooms = ["kitchen", "ballroom", "conservatory", "library", "study"];
let solution = null;

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Position update from clients
    socket.on('playerInfo', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username) return;

        const player = players.get(username);
        if (player) {
            // Update stored position
            player.x = data.x;
            player.y = data.y;

            // Broadcast to all OTHER players
            socket.broadcast.emit('playerMoved', {
                username: username,
                x: data.x,
                y: data.y
            });
        }
    });

    // Handle login
    socket.on('login', (data) => {
        console.log('User logged in:', data.username);

        // Check if this username is already in the game (reconnection)
        const existingPlayer = players.get(data.username);

        if (existingPlayer) {
            // Reconnection - update socket ID
            console.log(`${data.username} reconnected with new socket ID`);
            
            // Remove old socket mapping if exists
            socketToUser.delete(existingPlayer.socketId);
            
            // Update player's socketId
            existingPlayer.socketId = socket.id;
            
            // Update turn order if game has started
            const orderIndex = playerOrder.indexOf(data.username);
            if (orderIndex !== -1) {
                // Player already in turn order, keep their position
                console.log(`${data.username} maintained turn position ${orderIndex}`);
            }
        } else {
            // New player - assign a spawn based on join order
            const index = players.size % spawnPositions.length;
            const spawn = spawnPositions[index];

            // Store player info
            players.set(data.username, {
                username: data.username,
                socketId: socket.id,
                x: spawn.x,
                y: spawn.y,
                spawnIndex: index
            });

            // Add to turn order if game hasn't started yet
            if (playerOrder.length === 0) {
                playerOrder.push(data.username);
            }
        }

        // Update socket to username mapping
        socketToUser.set(socket.id, data.username);
        const playerData = players.get(data.username);

        // Send confirmation back to client (with starting position)
        socket.emit('loginSuccess', {
            username: playerData.username,
            x: playerData.x,
            y: playerData.y
        });

        // Send current players state to the newly joined client
        socket.emit('playersState', Array.from(players.values()).map(p => ({
            username: p.username,
            x: p.x,
            y: p.y
        })));

        // Notify other players (only if new player)
        if (!existingPlayer) {
            socket.broadcast.emit('playerJoined', {
                username: playerData.username,
                x: playerData.x,
                y: playerData.y
            });
        }

        // If game has started, send current turn info
        if (playerOrder.length > 0 && solution) {
            socket.emit('gameStarted', {
                order: playerOrder.map(uname => ({
                    username: uname
                })),
                activeUsername: playerOrder[currentTurn],
                answer: solution
            });
        } else if (players.size >= 2 && !solution) {
            // Auto-start when at least 2 players are present and no game running
            startGame();
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const username = socketToUser.get(socket.id);
        if (username) {
            console.log('User disconnected:', username);
            
            // Remove socket mapping
            socketToUser.delete(socket.id);
            
            // Check if player has other active connections
            const player = players.get(username);
            if (player && player.socketId === socket.id) {
                // This was the primary connection
                player.socketId = null; // Mark as disconnected but keep in game
                
                // Only remove from turn order if no reconnection
                const idx = playerOrder.indexOf(username);
                if (idx !== -1) {
                    // Keep player in turn order for potential reconnection
                    console.log(`${username} kept in turn order at position ${idx}`);
                    
                    // Skip turn if it's their turn
                    if (idx === currentTurn && playerOrder.length > 0) {
                        nextTurn();
                    }
                }
                
                // Notify other players
                io.emit('playerLeft', {
                    username: username
                });
            }
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
                    startGame();
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
        const username = socketToUser.get(socket.id);
        if (!username || username !== playerOrder[currentTurn]) return;
        nextTurn();
    });

    socket.on('askAbout', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username) return;

        if (!solution) {
            socket.emit('error_message', 'Game not started');
            return;
        }

        const { suspect, weapon, room } = data;
        const matches = [];

        if (suspect.toLowerCase() === solution.suspect.toLowerCase()) matches.push('suspect');
        if (weapon.toLowerCase() === solution.weapon.toLowerCase()) matches.push('weapon');
        if (room.toLowerCase() === solution.room.toLowerCase()) matches.push('room');

        let result = 'none';
        if (matches.length > 0) {
            // Randomly pick one of the matching cards to reveal
            result = matches[Math.floor(Math.random() * matches.length)];
        }

        socket.emit('askResult', { result });
        console.log(`${username} asked about ${suspect}/${weapon}/${room}, result: ${result}`);
    });
});

function startGame() {
    // 1. Get all usernames
    playerOrder = Array.from(players.keys());
    
    // 2. Safety check: Don't start with 0 players
    if (playerOrder.length === 0) return;

    // 3. Randomize the player order to make it fair
    playerOrder = playerOrder.sort(() => Math.random() - 0.5);

    // 4. Set the current turn to the first player in the shuffled list
    currentTurn = 0;

    console.log("Game starting with order:", playerOrder);

    // 5. Generate solution if not exists
    if (!solution) {
        solution = {
            suspect: randomFrom(suspects),
            weapon: randomFrom(weapons),
            room: randomFrom(rooms)
        };
        console.log("Solution generated:", solution);
    }

    // 6. Emit to EVERYONE that the game has started
    io.emit('gameStarted', {
        order: playerOrder.map(username => ({
            username: username
        })),
        activeUsername: playerOrder[currentTurn],
        answer: solution
    });

    // 7. Emit turn update
    const currentPlayer = players.get(playerOrder[currentTurn]);
    if (currentPlayer) {
        io.emit('turnUpdate', {
            activeUsername: playerOrder[currentTurn],
            username: currentPlayer.username
        });
    }
}

function rolldice(socket) {
    const username = socketToUser.get(socket.id);
    if (!username) return;

    // 1. Validation: Is it actually this player's turn?
    if (username !== playerOrder[currentTurn]) {
        socket.emit('error_message', "It's not your turn!");
        return;
    }

    // 2. Generate the result on the server
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    // 3. Broadcast result to EVERYONE (including the roller)
    io.emit('diceRolled', {
        username: username,
        d1: d1,
        d2: d2
    });
}

function nextTurn() {
    if (playerOrder.length === 0) return;

    // Find next active player (skip disconnected players)
    let attempts = 0;
    do {
        currentTurn = (currentTurn + 1) % playerOrder.length;
        attempts++;
        
        const nextUsername = playerOrder[currentTurn];
        const nextPlayer = players.get(nextUsername);
        
        // If player is connected and valid, use them
        if (nextPlayer && nextPlayer.socketId) {
            io.emit('turnUpdate', {
                activeUsername: nextUsername,
                username: nextPlayer.username
            });
            console.log(`Turn passed to ${nextUsername}`);
            return;
        }
        
        // Skip disconnected players
        console.log(`Skipping disconnected player: ${nextUsername}`);
    } while (attempts < playerOrder.length);

    // If all players are disconnected
    console.log("No active players found");
}

// Start server
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

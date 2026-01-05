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

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Handle login
    socket.on('login', (data) => {
        console.log('User logged in:', data.username);
        
        // Store player info
        players.set(socket.id, {
            username: data.username,
            socketId: socket.id
        });
        
        // Send confirmation back to client
        socket.emit('loginSuccess', {
            socketId: socket.id,
            username: data.username
        });
        
        // Notify other players
        socket.broadcast.emit('playerJoined', {
            username: data.username,
            socketId: socket.id
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
});

// Start server
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

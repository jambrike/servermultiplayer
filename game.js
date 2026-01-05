const socket = io('https://cleuro-game.onrender.com');
///plan for the next couple mins is to make it so when you get into a room you can click on different cards to choose what questions to ask like if it is the guard or zach
//then make it so when you make final guess you ae sening your answers to the sevrer and listening for win or lose
//then make it so your position can be updated to other players
//then make it so the players appear on eachothers screens


// Check if user is logged in
const username = localStorage.getItem('username');
if (!username) {
  window.location.href = 'login.html';
}

console.log(`Playing as: ${username}`);

// Track this player's socket ID (assigned by server when we connect)
let mySocketId = null;

// Track whether it's currently this player's turn to roll dice
// Server controls whose turn it is and sends updates
let isTurn = false;

const suspects = ["Janitor", "Aunt", "Chef", "James", "Butler", "Grandfather"]
const weapons = ["knife", "candlestick", "revolver", "wrench", "rope"]
const rooms = ["kitchen", "ballroom", "conservatory", "library", "study"]
//random pick function
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const answer = {
  suspect: randomFrom(suspects),
  weapons: randomFrom(weapons),
  room: randomFrom(rooms)
}

///roll counter
let rollCount = 0

// Players
const otherPlayers = [];

const rows = 18
const cols = 18
const gameArea = document.getElementById("game")
//walls

const board = []
for (let y = 0; y < rows; y++) {
  board[y] = []
  for (let x = 0; x < cols; x++) {
    board[y][x] = 1
  }
}
//put guy in yhr middle
const player = { x: 9, y: 9 }
let stepsleft = 0
let stepsleft2 = 0
//detect by position for this cause only 300 squares tbf
//complete rwork for spots array to each room and then give it an x and y
const roomTiles = {
  kitchen: {
    x: 0, y: 0, w: 4, h: 4, type: "kitchen", doors: [{ x: 3, y: 3 }],
    spots: [{ x: 1, y: 1, name: "bin" }, { x: 2, y: 3, name: "rug" }, { x: 0, y: 2, name: "drawer" }]
  },
  ballroom: {
    x: 6, y: 0, w: 6, h: 5, type: "room", doors: [{ x: 6, y: 4 }, { x: 11, y: 4 }],
    spots: [{ x: 7, y: 1, name: "bin" }, { x: 10, y: 3, name: "rug" }, { x: 8, y: 0, name: "drawer" }]
  },
  conservatory: {
    x: 13, y: 0, w: 5, h: 4, type: "study", doors: [{ x: 13, y: 3 }],
    spots: [{ x: 14, y: 1, name: "bin" }, { x: 17, y: 1, name: "rug" }, { x: 15, y: 3, name: "drawer" }]
  },
  library: {
    x: 0, y: 11, w: 4, h: 5, type: "library", doors: [{ x: 3, y: 11 }],
    spots: [{ x: 1, y: 12, name: "bin" }, { x: 2, y: 14, name: "rug" }, { x: 1, y: 15, name: "drawer" }]
  },
  study: {
    x: 13, y: 11, w: 5, h: 5, type: "study", doors: [{ x: 13, y: 11 }],
    spots: [{ x: 14, y: 12, name: "bin" }, { x: 17, y: 12, name: "rug" }, { x: 15, y: 15, name: "drawer" }]
  }
};
//place the answer in 3 different clue places
const roompool = Object.keys(roomTiles);
//
const shuffledRooms = roompool.sort(() => 0.5 - Math.random());
//change to room key because i using same css for conserve and i prob coulda js chnaged that but then thered be pther stuff
const cluelocations = {
  suspect: {
    roomKey: shuffledRooms[0], spot: randomFrom(roomTiles[shuffledRooms[0]].spots).name,
    sub: `this is ${answer.suspect} item and it has blood stains`
  },
  weapon: {
    roomKey: shuffledRooms[1], spot: randomFrom(roomTiles[shuffledRooms[1]].spots).name,
    sub: `Its the ${answer.weapons}`
  },
  room: {
    roomKey: shuffledRooms[2], spot: randomFrom(roomTiles[shuffledRooms[2]].spots).name,
    sub: `Theres some blood in here.`
  },
};
// This then picks which of the 3 items has the clue
const winningSpots = {};
for (let room in roomTiles) {
  let s = roomTiles[room].spots;
  winningSpots[room] = s[Math.floor(Math.random() * s.length)].name;
}
// Dice roll button click handler
document.getElementById("rolldice").onclick = () => {
  // First check if it's actually this player's turn
  // Server validates this too, but we check client-side first for better UX
  if (!isTurn) {
    alert("It's not your turn!");
    return;
  }

  // Send dice roll request to server
  // Server will generate random dice values and broadcast to all players
  // Format: {type: 'rolldice'} - server expects this message format
  socket.send(JSON.stringify({ type: 'rolldice' }));
}
// Listen for dice roll results from server
// Server broadcasts this to ALL players when someone rolls
// data contains: {username, d1, d2, socketId}
socket.on('diceRolled', (data) => {
  // Calculate total steps from both dice
  let steps = data.d1 + data.d2;

  // Add steps to this player's remaining steps
  stepsleft += steps;

  // Increment turn counter
  rollCount++;

  // Update the UI to show remaining steps
  document.getElementById("stepsleft").textContent = stepsleft;

  // Show roll result message
  document.getElementById("clue-text").textContent = `You rolled a ${steps}. Move your character!`;
  document.getElementById("clue-text").style.color = "#4CAF50";
});

// Listen for turn updates from server
// Server sends this after each dice roll to rotate turns
// data contains: {activePlayerId, username}
socket.on('turnUpdate', (data) => {
  // Check if the active player ID matches our socket ID
  // If yes, it's our turn. If no, we wait.
  isTurn = (data.activePlayerId === mySocketId);

  // Update UI based on whose turn it is
  if (isTurn) {
    // It's our turn - show prompt to roll
    document.getElementById("clue-text").textContent = "It's your turn! Roll the dice.";
    document.getElementById("clue-text").style.color = "#FFD700";
  } else {
    // Someone else's turn - show who's playing
    document.getElementById("clue-text").textContent = `It's ${data.username}'s turn.`;
    document.getElementById("clue-text").style.color = "#888";
  }
});

// Listen for successful connection to server
// This fires when socket.io establishes connection
socket.on('connect', () => {
  // Store our unique socket ID assigned by server
  // We need this to compare with activePlayerId to know if it's our turn
  mySocketId = socket.id;
  console.log('Connected with socket ID:', mySocketId);
});

// Listen for error messages from server
// Server sends these when validation fails (e.g., rolling out of turn)
socket.on('error_message', (message) => {
  alert(message);
});

//simeple function to find room by player position
function RoomAt(x, y) {
  for (let key in roomTiles) {
    let r = roomTiles[key];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return r;
    }
  }

  return null;
}

document.addEventListener("keydown", e => {
  if (stepsleft <= 0) return

  let dx = 0, dy = 0
  if (e.key === "ArrowUp") dy = -1
  if (e.key === "ArrowDown") dy = 1
  if (e.key === "ArrowLeft") dx = -1
  if (e.key === "ArrowRight") dx = 1

  if (dx === 0 && dy === 0) return;

  let nx = player.x + dx
  let ny = player.y + dy

  if (caniwalk(nx, ny)) {
    let wasInRoom = RoomAt(player.x, player.y);
    player.x = nx
    player.y = ny
    stepsleft--

    socket.emit('playerinfo', {
      x: player.x,
      y: player.y,
      stepsleft: stepsleft,
      rollCount: rollCount,
      username: localStorage.getItem('username')

    });
    document.getElementById("stepsleft").textContent = stepsleft

    let nowInRoom = RoomAt(nx, ny);
    render()

    if (nowInRoom && !wasInRoom) {
      console.log("Entered a room");
      stepsleft = 0;
      document.getElementById("stepsleft").textContent = stepsleft;
      // Small delay to ensure render completes before alert
      //beause i thnk it was causing to freeze
      setTimeout(() => {
        alert("You entered the " + nowInRoom.type + ". Search the Room for clues.");
      }, 100);
    }
  }
})

function checkRoom() {
  for (const r in roomTiles) {
    const t = roomTiles[r]
    if (//detect the bigger room update
      player.x >= t.x &&
      player.x < t.x + t.w &&
      player.y >= t.y &&
      player.y < t.y + t.h
    ) {
      console.log("in room:", r)
      return
    }
  }
}

function createPlayerToken(color) {
  const token = document.createElement("div");
  token.style.width = "22px";
  token.style.height = "22px";
  token.style.backgroundColor = color;
  token.style.borderRadius = "50%";
  token.style.border = "2px solid white";
  token.style.boxShadow = "0 0 5px rgba(0,0,0,0.5)";
  token.style.zIndex = "10";
  return token;
}

function render() {
  const gameContainer = document.getElementById('game');
  gameContainer.innerHTML = ''; // Clear the board

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';

      // Apply room/floor styling based on your board array
      const cellType = board[y][x];
      if (cellType !== 0) {
        cell.classList.add(cellClasses[cellType] || 'floor');
      }

      // 1. Draw The Local Player
      if (player.x === x && player.y === y) {
        const myToken = createPlayerToken("red"); // Local Player is red
        cell.appendChild(myToken);
      }

      // 2. Draw OTHERS
      // Assuming 'otherPlayers' is an object: { socketId: { x, y, username } }
      for (let id in otherPlayers) {
        const p = otherPlayers[id];
        if (p.x === x && p.y === y) {
          const otherToken = createPlayerToken("rgb(132, 77, 184)"); // Others are purple
          otherToken.title = p.username; // Hover to see name
          cell.appendChild(otherToken);
        }
      }

      gameContainer.appendChild(cell);
    }
  }
}

//now make it so they can only enter through door
function caniwalk(targetX, targetY) {
  if (targetX < 0 || targetX >= cols || targetY < 0 || targetY >= rows) return false;

  let currentRoom = RoomAt(player.x, player.y);
  let targetRoom = RoomAt(targetX, targetY);

  // Floor to Room
  if (!currentRoom && targetRoom) {
    return targetRoom.doors.some(door => door.x === targetX && door.y === targetY);
  }

  // leaving
  if (currentRoom && !targetRoom) {
    // You can only leave if on door
    return currentRoom.doors.some(door => door.x === player.x && door.y === player.y);
  }

  //  room to room
  if (currentRoom && targetRoom && currentRoom !== targetRoom) {
    return false;
  }

  return true;
}

//final guess on button
document.getElementById("solvebutton").onclick = function () {
  // Check if it's this player's turn before allowing them to make final guess
  // Only the player whose turn it is can submit a solution
  if (!isTurn) {
    alert("It's not your turn! You can only make a guess on your turn.");
    return;
  }

  let gSuspect = prompt("Who is the killer?");
  let gWeapon = prompt("What was the weapon?");
  let gRoom = prompt("In which room?");

  if (!gSuspect || !gWeapon || !gRoom) return;

  let isCorrect =
    gSuspect.toLowerCase() === answer.suspect.toLowerCase() &&
    gWeapon.toLowerCase() === answer.weapons.toLowerCase() &&
    gRoom.toLowerCase() === answer.room.toLowerCase();

  if (isCorrect) {
    alert(`Congratulations You solved the mystery! and it took you ${rollCount} turns, nice one! `);
    location.reload();
  } else {
    alert(`Wrong!! After ${rollCount} turns. The correct answer was: ${answer.suspect} with the ${answer.weapons} in the ${answer.room}.`
    );
  }
}
render()
// Listen for updates from the server
socket.on('playerMoved', (data) => {
  otherPlayers[data.socketId] = data; // Store/update their position
  render(); // Redraw the board to show them
});

// Listen for dice roll broadcasts from server
socket.on('playerRolled', (data) => {
  document.getElementById("clue-text").textContent = `${data.username} rolled ${data.roll}!`;
  document.getElementById("clue-text").style.color = "#4CAF50";
});

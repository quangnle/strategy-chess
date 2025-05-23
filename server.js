const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { Game, UNIT_STATS } = require('./battle-logic');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

let matches = {};
let nextMatchId = 1;
const MAX_UNITS_PER_PLAYER = 5;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // --- Sảnh chờ (Lobby) ---
    socket.on('getMatches', () => {
        const availableMatches = Object.values(matches)
            .filter(match => match.players.length < 2 && !match.gameStarted)
            .map(match => ({ id: match.id, name: match.name, playerCount: match.players.length }));
        socket.emit('matchList', availableMatches);
    });

    socket.on('createMatch', (matchName) => {
        const matchId = `match-${nextMatchId++}`;
        matches[matchId] = {
            id: matchId,
            name: matchName || `Match ${matchId}`,
            players: [{ id: socket.id, socket: socket, side: 0, ready: false, unitsSetup: [] }],
            gameState: null,
            gameStarted: false,
            host: socket.id
        };
        socket.join(matchId);
        socket.emit('matchCreated', { matchId, side: 0, matchName: matches[matchId].name });
        broadcastMatchList();
        console.log(`Match created: ${matchName || `Match ${matchId}`} (${matchId}) by ${socket.id}`);
    });

    socket.on('joinMatch', (matchId) => {
        const match = matches[matchId];
        if (match && match.players.length < 2 && !match.gameStarted) {
            const newPlayerSide = match.players[0].side === 0 ? 1 : 0;
            match.players.push({ id: socket.id, socket: socket, side: newPlayerSide, ready: false, unitsSetup: [] });
            socket.join(matchId);

            socket.emit('joinedMatch', { matchId, side: newPlayerSide, matchName: match.name });
            socket.to(matchId).emit('playerJoined', { playerId: socket.id, side: newPlayerSide, playerName: `Player ${newPlayerSide + 1}` });

            console.log(`${socket.id} joined ${match.name} (${matchId}) as side ${newPlayerSide}`);

            if (match.players.length === 2) {
                io.to(matchId).emit('navigateToSetup', { matchId, players: match.players.map(p => ({id: p.id, side: p.side})) });
                console.log(`Match ${matchId} is full. Moving to setup.`);
            }
            broadcastMatchList();
        } else {
            socket.emit('joinError', 'Match not found, full, or already started.');
        }
    });

    // --- Giai đoạn Chuẩn bị (Setup) ---
    socket.on('ready', (data) => {
        const match = matches[data.matchId];
        if (!match) {
            socket.emit('setupError', 'Match not found.');
            return;
        }

        const player = match.players.find(p => p.id === socket.id);
        if (player) {
            if (data.units.length !== MAX_UNITS_PER_PLAYER) {
                socket.emit('setupError', `Must select ${MAX_UNITS_PER_PLAYER} units.`);
                return;
            }
            player.ready = true;
            player.unitsSetup = data.units;
            console.log(`Player ${socket.id} in match ${data.matchId} is ready with units:`, data.units);

            socket.to(data.matchId).emit('playerReadyUpdate', { playerId: socket.id, isReady: true });

            const allReady = match.players.every(p => p.ready);
            if (allReady && match.players.length === 2) {
                console.log(`Both players ready in ${data.matchId}. Starting game.`);
                match.gameStarted = true;
                match.gameState = new Game();

                match.players.forEach((p) => {
                    const side = p.side;
                    const unitRow = side === 0 ? 1 : 9;
                    const startCol = Math.floor((11 - MAX_UNITS_PER_PLAYER) / 2);

                    p.unitsSetup.forEach((unitType, index) => {
                        const unitId = `unit-${side}-${index}`;
                        match.gameState.addInitialUnit({
                            id: unitId,
                            type: unitType,
                            x: startCol + index,
                            y: unitRow,
                            owner: side,
                        });
                    });
                });

                match.gameState.startNewRound(); // QUAN TRỌNG: Bắt đầu round đầu tiên, tính initiative
                io.to(data.matchId).emit('battleStart', match.gameState.getState());
                broadcastMatchList();
            }
        }
    });

    // --- Giai đoạn Trận đấu (Battle) ---
    function handleActionAndRespond(matchId, actionPromise) {
        actionPromise.then(result => {
            const match = matches[matchId];
            if (!match || !match.gameState) return; // Trận đấu có thể đã kết thúc/dọn dẹp

            if (result.success) {
                io.to(matchId).emit('gameStateUpdate', match.gameState.getState());
                // checkWinConditions được gọi bên trong battle-logic và kết quả có thể nằm trong 'result'
                if (result.gameOver) {
                    io.to(matchId).emit('gameOver', { winner: result.winner, reason: result.winReason || "Game ended." });
                    cleanupMatch(matchId);
                }
            } else {
                // Gửi lỗi về cho client đã thực hiện hành động
                const playerSocket = match.players.find(p => p.id === socket.id)?.socket;
                if (playerSocket) {
                    playerSocket.emit('actionError', result.message);
                }
            }
        }).catch(error => {
            console.error("Error processing action:", error);
            const playerSocket = matches[matchId]?.players.find(p => p.id === socket.id)?.socket;
            if (playerSocket) {
                playerSocket.emit('actionError', "Server error processing action.");
            }
        });
    }


    socket.on('move', (data) => { // data: { matchId, unitId, targetRow, targetCol }
        const match = matches[data.matchId];
        if (!match || !match.gameState || !match.gameStarted) return socket.emit('actionError', 'Game not active.');
        const player = match.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('actionError', 'Player not found in match.');

        // Sử dụng Promise để xử lý bất đồng bộ nếu có trong tương lai, và để handleActionAndRespond
        const actionPromise = Promise.resolve(
            match.gameState.moveUnit(data.unitId, data.targetCol, data.targetRow, player.side)
        );
        handleActionAndRespond(data.matchId, actionPromise);
    });

    socket.on('attack', (data) => { // data: { matchId, attackerId, targetId }
        const match = matches[data.matchId];
        if (!match || !match.gameState || !match.gameStarted) return socket.emit('actionError', 'Game not active.');
        const player = match.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('actionError', 'Player not found in match.');

        const actionPromise = Promise.resolve(
            match.gameState.attackUnit(data.attackerId, data.targetId, player.side)
        );
        handleActionAndRespond(data.matchId, actionPromise);
    });

    socket.on('finishUnitAction', (data) => { // data: { matchId, unitId }
        const match = matches[data.matchId];
        if (!match || !match.gameState || !match.gameStarted) return socket.emit('actionError', 'Game not active.');
        const player = match.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('actionError', 'Player not found.');

        // Kiểm tra xem có phải quân của người chơi này đang cố gắng kết thúc không
        const unitToFinish = match.gameState.getUnitById(data.unitId);
        if (!unitToFinish || unitToFinish.owner !== player.side) {
            return socket.emit('actionError', 'Cannot finish action for this unit.');
        }

        const actionPromise = Promise.resolve(
            match.gameState.requestFinishUnitAction(data.unitId)
        );
        handleActionAndRespond(data.matchId, actionPromise);
    });


    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const matchId in matches) {
            const match = matches[matchId];
            const playerIndex = match.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const disconnectedPlayer = match.players.splice(playerIndex, 1)[0];
                console.log(`Player ${socket.id} (side ${disconnectedPlayer.side}) removed from match ${matchId}`);

                if (match.gameStarted && match.gameState && match.gameState.winner === null) { // Game đang diễn ra và chưa có người thắng
                    if (match.players.length > 0) { // Nếu còn người chơi
                        const winnerSide = match.players[0].side; // Người còn lại thắng
                        io.to(matchId).emit('gameOver', { winner: winnerSide, reason: 'Opponent disconnected.' });
                    }
                    cleanupMatch(matchId);
                } else if (match.players.length === 0) {
                    cleanupMatch(matchId);
                } else { // Trận chưa bắt đầu, hoặc đã kết thúc
                    // Nếu trận chưa bắt đầu và còn người, thông báo cho người còn lại
                    if (!match.gameStarted) {
                         match.players[0].ready = false;
                         io.to(matchId).emit('opponentLeftSetup', {
                             matchId: match.id,
                             name: match.name,
                             playerCount: match.players.length,
                             // Gửi thông tin về người chơi còn lại để client có thể reset trạng thái ready của họ
                             remainingPlayerId: match.players[0].id
                         });
                    }
                }
                broadcastMatchList();
                break;
            }
        }
    });

    function broadcastMatchList() {
        const availableMatches = Object.values(matches)
            .filter(m => m.players.length < 2 && !m.gameStarted)
            .map(m => ({ id: m.id, name: m.name, playerCount: m.players.length }));
        io.emit('matchListUpdate', availableMatches);
    }

    function cleanupMatch(matchId) {
        if (matches[matchId]) {
            // Có thể thêm logic dọn dẹp tài nguyên của game nếu cần
            // matches[matchId].gameState = null; // Hoặc xóa hẳn
            delete matches[matchId];
            broadcastMatchList();
            console.log(`Match ${matchId} cleaned up.`);
        }
    }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
    console.log(`Game server is running. Access from LAN via your computer's local IP at port ${PORT}.`);
    console.log("(Find your local IP using 'ipconfig' on Windows or 'ifconfig'/'ip addr' on Linux/macOS)");
});
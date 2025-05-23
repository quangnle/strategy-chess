const socket = io();

// --- DOM Elements ---
const lobbyView = document.getElementById('lobby-view');
const createMatchButton = document.getElementById('create-match-btn');
const matchNameInput = document.getElementById('match-name-input');
const matchesListDiv = document.getElementById('matches-list');
const lobbyStatus = document.getElementById('lobby-status');

const setupView = document.getElementById('setup-view');
const setupTitle = document.getElementById('setup-title');
const setupMatchNameSpan = document.getElementById('setup-match-name');
const playerSideIndicatorSetup = document.getElementById('player-side-indicator-setup');
const unitSelectionOptionsDiv = document.getElementById('unit-selection-options');
const chosenUnitsListUl = document.getElementById('chosen-units-list');
const readyButton = document.getElementById('ready-btn');
const setupStatusOpponent = document.getElementById('setup-status-opponent');
const setupStatusSelf = document.getElementById('setup-status-self');
const maxUnitsIndicator = document.getElementById('max-units-indicator');

const battleView = document.getElementById('battle-view');
const battleTitle = document.getElementById('battle-title');
const battleMatchNameSpan = document.getElementById('battle-match-name');
const playerSideIndicatorBattle = document.getElementById('player-side-indicator-battle');
const turnIndicator = document.getElementById('turn-indicator');
const gameCanvasContainer = document.getElementById('game-canvas-container');
const finishActionButton = document.getElementById('end-turn-btn'); // Nút "Hoàn thành Hành Động"
const skipUnitActionButton = document.getElementById('skip-unit-action-btn'); // Nút "Bỏ Qua Lượt Quân"

// --- Game State Variables ---
let currentMatchId = null;
let playerSide = null; // 0 or 1
let currentView = 'lobby';
let selectedUnitsForSetup = [];
const MAX_UNITS = 5;
maxUnitsIndicator.textContent = MAX_UNITS;
let p5Instance = null;
let currentMatchName = "";
let currentActiveUnitIdClient = null;
let currentPlayersInSetup = []; // [{id, side, name, ready}, ...]
let currentGameStateForSketch = null; // Để p5Instance có thể truy cập nếu cần

// --- UI Switching Logic ---
function showView(viewName) {
    lobbyView.style.display = 'none';
    setupView.style.display = 'none';
    battleView.style.display = 'none';

    if (viewName === 'lobby') lobbyView.style.display = 'block';
    else if (viewName === 'setup') setupView.style.display = 'block';
    else if (viewName === 'battle') battleView.style.display = 'block';
    currentView = viewName;
}

// --- Lobby Logic ---
createMatchButton.addEventListener('click', () => {
    const matchName = matchNameInput.value.trim();
    socket.emit('createMatch', matchName);
    lobbyStatus.textContent = 'Đang tạo trận...';
});

function displayMatches(matches) {
    matchesListDiv.innerHTML = '';
    if (matches.length === 0) {
        matchesListDiv.innerHTML = '<p>Không có trận nào đang chờ. Hãy tạo một trận!</p>';
        return;
    }
    matches.forEach(match => {
        const matchElement = document.createElement('li');
        matchElement.classList.add('match-item');
        matchElement.innerHTML = `
            <span>${match.name} (${match.playerCount}/2)</span>
            <button class="join-btn" data-match-id="${match.id}">Tham Gia</button>
        `;
        matchElement.querySelector('.join-btn').addEventListener('click', () => {
            socket.emit('joinMatch', match.id);
            lobbyStatus.textContent = `Đang tham gia trận ${match.name}...`;
        });
        matchesListDiv.appendChild(matchElement);
    });
}
socket.on('matchList', (matches) => { displayMatches(matches); });
socket.on('matchListUpdate', (matches) => { if (currentView === 'lobby') { displayMatches(matches); } });

socket.on('matchCreated', (data) => { // { matchId, side, matchName }
    currentMatchId = data.matchId;
    playerSide = data.side;
    currentMatchName = data.matchName;
    lobbyStatus.textContent = `Đã tạo trận "${currentMatchName}". Đang vào phòng chuẩn bị...`;
    // Server sẽ gửi 'navigateToSetup' ngay sau đó
});

socket.on('joinedMatch', (data) => { // { matchId, side, matchName }
    currentMatchId = data.matchId;
    playerSide = data.side;
    currentMatchName = data.matchName;
    lobbyStatus.textContent = `Đã tham gia trận "${currentMatchName}". Đang vào phòng chuẩn bị...`;
    // Server sẽ gửi 'navigateToSetup' ngay sau đó
});

socket.on('joinError', (message) => {
    alert(`Lỗi Tham Gia Trận: ${message}`);
    lobbyStatus.textContent = '';
    socket.emit('getMatches');
});

// --- Setup Logic ---
function updateSetupPlayerStatusUI() {
    const self = currentPlayersInSetup.find(p => p.id === socket.id);
    const opponent = currentPlayersInSetup.find(p => p.id !== socket.id);

    if (self) {
        setupStatusSelf.textContent = `Bạn (${self.name || 'Player'}): ${self.ready ? "ĐÃ SẴN SÀNG" : "Đang chọn quân"}`;
    } else {
        setupStatusSelf.textContent = "Trạng thái của bạn: Lỗi không tìm thấy thông tin.";
    }

    if (opponent) {
        setupStatusOpponent.textContent = `Đối thủ (${opponent.name || 'Player'}): ${opponent.ready ? "ĐÃ SẴN SÀNG" : "Đang chọn quân"}`;
    } else {
        setupStatusOpponent.textContent = "Đang chờ đối thủ tham gia...";
    }
}

socket.on('navigateToSetup', (data) => { // { matchId, matchName, players: [{id, side, name, ready}, ...] }
    // Chỉ xử lý nếu matchId khớp hoặc chưa có matchId (trường hợp tạo mới)
    if (currentMatchId && data.matchId !== currentMatchId && currentView === "lobby" ) {
         console.warn("Received navigateToSetup for an old/different matchId while in lobby. Current:", currentMatchId, "Received:", data.matchId);
         // Có thể đây là message cũ, hoặc user đã tạo/join trận khác.
         // Nếu user đã ở trong 1 trận và currentView không phải lobby, thì cần cẩn thận hơn.
         // For now, if already in a match (currentMatchId set) and this is for a *different* one, ignore.
         return;
    }

    currentMatchId = data.matchId;
    currentMatchName = data.matchName || currentMatchName; // Ưu tiên tên mới từ server
    currentPlayersInSetup = data.players;

    console.log(`Navigating to setup for match: "${currentMatchName}", I am side: ${playerSide}. Players in setup:`, currentPlayersInSetup);
    showView('setup');

    setupMatchNameSpan.textContent = currentMatchName;
    playerSideIndicatorSetup.textContent = `${playerSide + 1} (Phe ${playerSide})`;

    selectedUnitsForSetup = [];
    updateChosenUnitsDisplay();
    document.querySelectorAll('.unit-select-btn').forEach(btn => btn.disabled = false);

    const myCurrentInfo = currentPlayersInSetup.find(p => p.id === socket.id);
    if (myCurrentInfo && myCurrentInfo.ready) {
        readyButton.disabled = true;
        readyButton.textContent = 'Đang chờ đối thủ...';
    } else {
        readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS; // Ban đầu sẽ true vì selectedUnits = 0
        readyButton.textContent = "Sẵn Sàng";
    }
    updateSetupPlayerStatusUI();
});

socket.on('opponentJoinedSetup', (data) => { // { opponent: {id, side, name, ready}, players }
    if (currentView === 'setup' && currentMatchId) {
        console.log("Opponent has joined setup:", data.opponent);
        currentPlayersInSetup = data.players;
        updateSetupPlayerStatusUI();
    }
});

socket.on('playerReadyUpdate', (data) => { // { playerId, playerName, isReady }
    if (currentView === 'setup' && currentMatchId) {
        const playerToUpdate = currentPlayersInSetup.find(p => p.id === data.playerId);
        if (playerToUpdate) {
            playerToUpdate.ready = data.isReady;
            playerToUpdate.name = data.playerName || playerToUpdate.name;
            updateSetupPlayerStatusUI();
        }
    }
});

socket.on('opponentLeftSetup', (data) => { // { matchId, matchName, remainingPlayerInfo }
    if (currentMatchId === data.matchId && currentView === 'setup') {
        alert('Đối thủ đã rời khỏi phòng chuẩn bị!');
        currentPlayersInSetup = currentPlayersInSetup.filter(p => p.id === socket.id); // Chỉ còn mình ta

        if (data.remainingPlayerInfo && data.remainingPlayerInfo.id === socket.id) {
            const self = currentPlayersInSetup.find(p => p.id === socket.id);
            if (self) {
                 self.ready = false; // Server đã reset, client cũng nên reset local state
                 self.name = data.remainingPlayerInfo.name; // Cập nhật tên nếu có thay đổi
            }
            readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS;
            readyButton.textContent = "Sẵn Sàng";
        }
        updateSetupPlayerStatusUI();
    }
});


document.querySelectorAll('.unit-select-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        if (selectedUnitsForSetup.length < MAX_UNITS) {
            selectedUnitsForSetup.push(e.target.dataset.type);
            updateChosenUnitsDisplay();
        }
        readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS; // Cập nhật lại trạng thái nút ready
        if (selectedUnitsForSetup.length === MAX_UNITS) {
            document.querySelectorAll('.unit-select-btn').forEach(btn => btn.disabled = true);
        }
    });
});
function updateChosenUnitsDisplay() {
    chosenUnitsListUl.innerHTML = '';
    selectedUnitsForSetup.forEach((unitType, index) => {
        const li = document.createElement('li');
        li.textContent = unitType;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Xóa'; removeBtn.classList.add('remove-unit-btn');
        removeBtn.onclick = () => {
            selectedUnitsForSetup.splice(index, 1); updateChosenUnitsDisplay();
            document.querySelectorAll('.unit-select-btn').forEach(btn => btn.disabled = false);
            readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS; // Cập nhật lại
        };
        li.appendChild(removeBtn); chosenUnitsListUl.appendChild(li);
    });
    // readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS; // Đã chuyển lên trên
}
readyButton.addEventListener('click', () => {
    if (selectedUnitsForSetup.length === MAX_UNITS) {
        socket.emit('ready', { matchId: currentMatchId, units: selectedUnitsForSetup });
        readyButton.disabled = true; readyButton.textContent = 'Đang chờ đối thủ...';
        const self = currentPlayersInSetup.find(p => p.id === socket.id);
        if(self) self.ready = true; // Cập nhật local state
        updateSetupPlayerStatusUI();
    }
});
socket.on('setupError', (message) => {
    alert(`Lỗi Thiết Lập: ${message}`);
    // Có thể cần reset trạng thái ready của nút nếu lỗi từ server
    const self = currentPlayersInSetup.find(p => p.id === socket.id);
    if (self && !self.ready) { // Chỉ reset nếu mình chưa ready
        readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS;
        readyButton.textContent = 'Sẵn Sàng';
    }
});

// --- Battle Logic ---
function updateBattleUIWithGameState(gameState) {
    if (!gameState) {
        finishActionButton.disabled = true;
        skipUnitActionButton.disabled = true;
        turnIndicator.textContent = "Đang chờ...";
        return;
    }
    currentGameStateForSketch = gameState; // Cập nhật state để p5 có thể truy cập
    currentActiveUnitIdClient = gameState.activeUnitId;

    const activeUnit = gameState.units.find(u => u.id === gameState.activeUnitId);
    const activeUnitState = gameState.activeUnitId ? gameState.activeUnitActionState : null;

    if (activeUnit) {
        const unitDisplayName = `${activeUnit.type} (ID:...${activeUnit.id.slice(-2)})`;
        const ownerName = currentPlayersInSetup.find(p => p.side === activeUnit.owner)?.name || `Đội ${activeUnit.owner + 1}`;
        turnIndicator.innerHTML = `Lượt của: <strong style="color:${activeUnit.owner === playerSide ? 'mediumseagreen' : 'tomato'}">${unitDisplayName}</strong> (${ownerName})`;

        const isMyUnitActive = activeUnit.owner === playerSide;
        let canManuallyFinish = false;
        let canSkip = false;

        if (isMyUnitActive && activeUnitState) {
            if (!activeUnitState.attacked) { // Chỉ có thể tương tác nếu quân chưa tấn công
                if (!activeUnitState.moved) { // Chưa di chuyển và chưa tấn công -> có thể Bỏ Qua
                    canSkip = true;
                }
                // Đã di chuyển và chưa tấn công -> có thể Hoàn thành (nếu không muốn tấn công)
                // Server sẽ tự kết thúc nếu di chuyển mà không có mục tiêu
                // Nút này hữu ích nếu có mục tiêu nhưng không muốn tấn công
                if (activeUnitState.moved) {
                    canManuallyFinish = true;
                }
            }
        }

        finishActionButton.disabled = !canManuallyFinish;
        finishActionButton.textContent = canManuallyFinish ? `Xong (${activeUnit.type})` : "Hoàn thành";

        skipUnitActionButton.disabled = !canSkip;
        skipUnitActionButton.textContent = canSkip ? `Bỏ lượt (${activeUnit.type})` : "Bỏ Qua Lượt";

    } else if (gameState.winner !== null && gameState.winner !== undefined) {
        turnIndicator.textContent = "TRẬN ĐẤU KẾT THÚC!";
        finishActionButton.disabled = true;
        skipUnitActionButton.disabled = true;
    } else {
        turnIndicator.textContent = "Đang chờ quân tiếp theo...";
        finishActionButton.disabled = true;
        skipUnitActionButton.disabled = true;
    }

    if (p5Instance && typeof p5Instance.setActiveUnitId === 'function') {
        p5Instance.setActiveUnitId(gameState.activeUnitId, activeUnit ? activeUnit.owner : -1);
    }
}

socket.on('battleStart', (initialGameState) => {
    console.log('Battle starting!', initialGameState);
    currentGameStateForSketch = initialGameState;
    showView('battle');
    battleMatchNameSpan.textContent = currentMatchName;
    playerSideIndicatorBattle.textContent = `${playerSide + 1} (Phe ${playerSide})`;

    if (!p5Instance) {
        p5Instance = new p5(sketchFunction, gameCanvasContainer);
        if(p5Instance) { // Gắn hàm vào instance sau khi tạo
            p5Instance.getCurrentGameState = function() { return currentGameStateForSketch; }
        }
    }
    if (p5Instance && typeof p5Instance.setupGameBoard === 'function') {
        p5Instance.setupGameBoard(initialGameState, playerSide);
    }
    updateBattleUIWithGameState(initialGameState);
});

socket.on('gameStateUpdate', (gameState) => {
    console.log('Game state updated:', gameState);
    currentGameStateForSketch = gameState;
    if (p5Instance && currentView === 'battle' && typeof p5Instance.updateGameState === 'function') {
        p5Instance.updateGameState(gameState);
    }
    updateBattleUIWithGameState(gameState);
});

finishActionButton.addEventListener('click', () => {
    if (currentMatchId && currentActiveUnitIdClient) {
        const activeUnitInClientState = currentGameStateForSketch?.units.find(u => u.id === currentActiveUnitIdClient);
        if (activeUnitInClientState && activeUnitInClientState.owner === playerSide) {
            const activeUnitActionState = currentGameStateForSketch?.activeUnitActionState;
            if (activeUnitActionState && activeUnitActionState.moved && !activeUnitActionState.attacked) {
                socket.emit('finishUnitAction', { matchId: currentMatchId, unitId: currentActiveUnitIdClient });
                finishActionButton.disabled = true;
                skipUnitActionButton.disabled = true;
            }
        }
    }
});

skipUnitActionButton.addEventListener('click', () => {
    if (currentMatchId && currentActiveUnitIdClient) {
        const activeUnitInClientState = currentGameStateForSketch?.units.find(u => u.id === currentActiveUnitIdClient);
        if (activeUnitInClientState && activeUnitInClientState.owner === playerSide) {
            const activeUnitActionState = currentGameStateForSketch?.activeUnitActionState;
            if (activeUnitActionState && !activeUnitActionState.moved && !activeUnitActionState.attacked) {
                socket.emit('finishUnitAction', { matchId: currentMatchId, unitId: currentActiveUnitIdClient });
                finishActionButton.disabled = true;
                skipUnitActionButton.disabled = true;
            }
        }
    }
});

window.attemptMove = function(unitId, targetRow, targetCol) {
    if (unitId !== currentActiveUnitIdClient) {
        console.warn("Attempting to move a non-active unit from window.attemptMove.");
        // alert("Không phải lượt của quân này để di chuyển!"); // Có thể không cần alert ở đây nếu UI đã ngăn chặn
        return;
    }
    socket.emit('move', { matchId: currentMatchId, unitId, targetRow, targetCol });
}

window.attemptAttack = function(attackerId, targetId) {
    if (attackerId !== currentActiveUnitIdClient) {
        console.warn("Attempting to attack with a non-active unit from window.attemptAttack.");
        // alert("Không phải lượt của quân này để tấn công!");
        return;
    }
    socket.emit('attack', { matchId: currentMatchId, attackerId, targetId });
}

socket.on('actionError', (message) => {
    alert(`Lỗi Hành Động: ${message}`);
    // Cập nhật lại UI dựa trên trạng thái game hiện tại, vì hành động có thể đã bị từ chối
    if(currentGameStateForSketch) updateBattleUIWithGameState(currentGameStateForSketch);
});

function handleGameOver(data) {
    if (currentView !== 'battle' && currentView !== 'setup') { // Tránh alert nhiều lần nếu đã ở lobby
         // Hoặc nếu currentMatchId đã null (đã reset)
        if(!currentMatchId) return;
    }
    let message = `Trận đấu kết thúc! ${data.reason || ''}\n`;
    if (data.winner === playerSide) {
        message += "BẠN THẮNG!";
    } else if (data.winner !== null && data.winner !== undefined) {
        const winnerPlayerInfo = currentPlayersInSetup.find(p => p.side === data.winner);
        const winnerName = winnerPlayerInfo ? winnerPlayerInfo.name : `Người chơi ${data.winner + 1}`;
        message += `${winnerName} THẮNG!`;
    } else {
        message += "Trận đấu hòa.";
    }
    alert(message);
    resetClientStateForNewGame();
}
socket.on('gameOver', handleGameOver);

function resetClientStateForNewGame() {
    showView('lobby');
    if (p5Instance && typeof p5Instance.resetGame === 'function') {
        p5Instance.resetGame();
        // Cân nhắc remove hẳn p5Instance và tạo mới nếu cần để tránh rò rỉ bộ nhớ
        // p5Instance.remove();
        // p5Instance = null;
    }
    currentMatchId = null;
    playerSide = null;
    selectedUnitsForSetup = [];
    currentMatchName = "";
    currentActiveUnitIdClient = null;
    currentPlayersInSetup = [];
    currentGameStateForSketch = null; // Quan trọng: reset state này
    lobbyStatus.textContent = "";
    socket.emit('getMatches');
}

socket.on('disconnect', (reason) => {
    if (currentView !== 'lobby') {
        alert(`Mất kết nối với server: ${reason}.\nBạn sẽ được đưa về Sảnh chờ.`);
    }
    resetClientStateForNewGame();
});

// Initialize
showView('lobby');
socket.emit('getMatches');
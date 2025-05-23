const sketchFunction = (p) => {
    const TILE_SIZE = 45;
    const BOARD_COLS = 11;
    const BOARD_ROWS = 11;
    let currentGameState = null;
    let localPlayerSide = -1; // Phe của người chơi cục bộ (0 hoặc 1)

    let selectedUnitId = null;  // ID của quân cờ đang được người chơi CHỌN trên bản đồ
    let possibleMoves = [];     // Các ô có thể di chuyển tới của quân đang chọn
    let possibleAttacks = [];   // Các quân địch có thể tấn công của quân đang chọn

    // Thông tin về quân cờ đang được kích hoạt lượt đi (active) theo thứ tự initiative
    let currentActiveUnitIdSketch = null;
    let currentActiveUnitOwnerSketch = -1; // Chủ sở hữu của quân đang active

    // Biến cho hiệu ứng nhấp nháy
    let blinkFrameCounter = 0;
    const BLINK_ON_DURATION = 25; // Số frame viền "sáng"
    const BLINK_OFF_DURATION = 25; // Số frame viền "tối" hơn (hoặc trạng thái khác)
    const BLINK_CYCLE_TOTAL = BLINK_ON_DURATION + BLINK_OFF_DURATION;
    let isActiveBlinkStrong = true; // Trạng thái hiện tại của nhấp nháy

    // Màu sắc và ký hiệu cho các loại quân
    const unitRenderInfo = {
        TANKER: { color: [50, 50, 200], symbol: 'T' },
        RANGER: { color: [50, 200, 50], symbol: 'R' },
        ASSASSIN: { color: [200, 50, 50], symbol: 'A' },
        BASE: { color: [150, 150, 150], symbol: 'B' }
    };

    p.setup = function () {
        p.createCanvas(BOARD_COLS * TILE_SIZE, BOARD_ROWS * TILE_SIZE);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(TILE_SIZE * 0.45);
    };

    // Được gọi bởi client.js khi trận đấu bắt đầu
    p.setupGameBoard = function (initialState, playerSide) {
        currentGameState = initialState;
        localPlayerSide = playerSide;
        selectedUnitId = null;
        possibleMoves = [];
        possibleAttacks = [];
        blinkFrameCounter = 0; // Reset bộ đếm nhấp nháy
        isActiveBlinkStrong = true;
        console.log("p5: Game board setup. Player side:", localPlayerSide);
        if (!p.isLooping()) { // Đảm bảo loop() được gọi nếu chưa
            p.loop();
        }
        p.redraw(); // Vẽ lại lần đầu
    };

    // Được gọi bởi client.js khi có cập nhật trạng thái từ server
    p.updateGameState = function (newState) {
        currentGameState = newState;
        // Cập nhật thông tin quân đang active từ state mới
        p.setActiveUnitId(newState.activeUnitId, newState.units.find(u => u.id === newState.activeUnitId)?.owner);

        if (selectedUnitId) {
            const unit = findUnitById(selectedUnitId);
            // Nếu quân đang chọn không còn tồn tại, không phải của mình, chết, hoặc không phải là quân đang active thì bỏ chọn
            if (!unit || unit.owner !== localPlayerSide || unit.hp <= 0 || unit.id !== currentActiveUnitIdSketch) {
                resetSelection();
            } else {
                // Nếu quân đang chọn vẫn hợp lệ và là quân đang active, tính lại actions
                calculatePossibleActions(unit);
            }
        }
        if (p.isLooping()) p.redraw(); // Yêu cầu vẽ lại nếu đang loop
    };

    // Được gọi bởi client.js để thông báo cho sketch biết quân nào đang active
    p.setActiveUnitId = function(unitId, owner) {
        const oldActiveUnitId = currentActiveUnitIdSketch;
        currentActiveUnitIdSketch = unitId;
        currentActiveUnitOwnerSketch = owner;

        // Nếu quân active thay đổi và quân đang được chọn không phải là quân active mới (hoặc không có quân active mới)
        // thì bỏ chọn quân cũ.
        if (oldActiveUnitId !== unitId && selectedUnitId && selectedUnitId !== unitId) {
            resetSelection();
        }
        // Nếu có quân active mới và đó là quân của người chơi, tự động chọn nó nếu chưa có gì được chọn
        // Hoặc nếu quân được chọn trước đó không phải là quân active mới
        else if (unitId && owner === localPlayerSide && (!selectedUnitId || selectedUnitId !== unitId)) {
            const activeUnit = findUnitById(unitId);
            if (activeUnit) {
                selectUnit(activeUnit); // Tự động chọn quân đang active của mình
            }
        }
        if (p.isLooping()) p.redraw();
    };

    // Hàm để client.js (ví dụ nút "Finish Action") có thể lấy active unit id
    p.getActiveUnitId = function() { return currentActiveUnitIdSketch; };
    p.getActiveUnitOwner = function() { return currentActiveUnitOwnerSketch; };


    p.draw = function () {
        // Cập nhật trạng thái nhấp nháy
        blinkFrameCounter = (blinkFrameCounter + 1) % BLINK_CYCLE_TOTAL;
        isActiveBlinkStrong = blinkFrameCounter < BLINK_ON_DURATION;

        p.background(235);
        if (!currentGameState) {
            p.fill(0);
            p.textSize(20);
            p.text("Đang chờ dữ liệu game...", p.width / 2, p.height / 2);
            return;
        }
        drawGrid();
        drawHighlights();
        drawUnits();
    };

    function drawGrid() {
        for (let r_logical = 0; r_logical < BOARD_ROWS; r_logical++) {
            for (let c_grid = 0; c_grid < BOARD_COLS; c_grid++) {
                p.stroke(180);
                p.strokeWeight(1);
                if ((r_logical + c_grid) % 2 === 0) { p.fill(250, 250, 240); }
                else { p.fill(240, 240, 220); }

                const displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - r_logical) : r_logical;
                p.rect(c_grid * TILE_SIZE, displayRow * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    function drawUnits() {
        if (!currentGameState || !currentGameState.units) return;

        currentGameState.units.forEach(unit => {
            if (unit.hp <= 0 && unit.type !== 'Base') return;

            const renderConfig = unitRenderInfo[unit.type.toUpperCase()];
            if (!renderConfig) return;

            const logicalUnitY = unit.y;
            let displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - logicalUnitY) : logicalUnitY;
            const displayCol = unit.x;

            const xPos = displayCol * TILE_SIZE + TILE_SIZE / 2;
            const yPos = displayRow * TILE_SIZE + TILE_SIZE / 2;

            let unitColor = [...renderConfig.color];
            if (unit.owner !== localPlayerSide) {
                unitColor = unitColor.map(c => Math.max(0, c - 40));
            }

            p.push(); // Cho việc vẽ hình elip của quân cờ

            let mainStrokeWeight = 1.5;
            let mainStrokeColor = p.color(30); // Viền mặc định

            if (selectedUnitId === unit.id && unit.id !== currentActiveUnitIdSketch) { // Được chọn nhưng KHÔNG active
                mainStrokeWeight = 3.5;
                mainStrokeColor = p.color(255, 204, 0); // Vàng
            }

            // Viền cho quân đang active (nhấp nháy) sẽ đè lên các viền khác nếu có
            if (unit.id === currentActiveUnitIdSketch) {
                if (isActiveBlinkStrong) {
                    mainStrokeWeight = 4.5; // Trạng thái "sáng" của nhấp nháy
                    mainStrokeColor = p.color(255, 165, 0, 230); // Màu cam/vàng đậm, nổi bật
                } else {
                    mainStrokeWeight = 3.0; // Trạng thái "tối" hơn của nhấp nháy
                    mainStrokeColor = p.color(0, 200, 200, 180); // Màu xanh lam nhạt hơn
                }
                // Nếu quân active cũng là quân đang được chọn (selectedUnitId === unit.id),
                // hiệu ứng nhấp nháy của active vẫn được ưu tiên.
            }

            p.strokeWeight(mainStrokeWeight);
            p.stroke(mainStrokeColor);

            p.fill(unitColor[0], unitColor[1], unitColor[2]);
            p.ellipse(xPos, yPos, TILE_SIZE * 0.75, TILE_SIZE * 0.75);
            p.pop(); // Kết thúc push cho elip

            // Push/pop riêng cho text và HP bar
            p.push();
            p.fill(unit.owner === localPlayerSide ? 255 : 220);
            p.noStroke();
            p.textSize(TILE_SIZE * 0.4);
            p.text(renderConfig.symbol, xPos, yPos);

            // Draw HP bar 
            if (unit.hp !== undefined && unit.maxHp !== undefined) {
                const hpBarWidth = TILE_SIZE * 0.7;
                const hpBarHeight = 6;
                const hpBarX = displayCol * TILE_SIZE + (TILE_SIZE - hpBarWidth) / 2;
                const ellipseVisualRadiusY = (TILE_SIZE * 0.75) / 2;
                const ellipseTopY = yPos - ellipseVisualRadiusY;
                const hpBarPadding = 2;
                const hpBarY = ellipseTopY - hpBarHeight - hpBarPadding;

                p.strokeWeight(0.5);
                p.stroke(30);
                p.fill(80, 80, 80);
                p.rect(hpBarX, hpBarY, hpBarWidth, hpBarHeight, 2);

                const currentHpWidth = hpBarWidth * (Math.max(0, unit.hp) / unit.maxHp);
                if (unit.owner === localPlayerSide) { p.fill(0, 200, 0); }
                else { p.fill(200, 0, 0); }

                if (currentHpWidth > 0) {
                    p.rect(hpBarX, hpBarY, currentHpWidth, hpBarHeight, 2);
                }

                p.fill(255);
                p.noStroke();
                p.textSize(hpBarHeight * 1.5);
                p.textAlign(p.CENTER, p.CENTER);
                p.text(`${unit.hp}`, hpBarX + hpBarWidth / 2, hpBarY + hpBarHeight / 2 + 1);
            }
            p.pop(); // Kết thúc push cho text/HP bar
        });
    }

    function drawHighlights() {
        p.noStroke();
        possibleMoves.forEach(move => {
            const logicalMoveY = move.y;
            let displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - logicalMoveY) : logicalMoveY;
            p.fill(0, 255, 0, 80);
            p.rect(move.x * TILE_SIZE, displayRow * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        });
        possibleAttacks.forEach(targetInfo => {
            const logicalTargetY = targetInfo.y;
            let displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - logicalTargetY) : logicalTargetY;
            p.fill(255, 0, 0, 100);
            p.rect(targetInfo.x * TILE_SIZE, displayRow * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        });
    }

    p.mousePressed = function () {
        if (!currentGameState || !p.canvas ||
            p.mouseX < 0 || p.mouseX >= p.width || p.mouseY < 0 || p.mouseY >= p.height) {
            return; // Click ngoài canvas hoặc game chưa sẵn sàng
        }

        // Chỉ cho phép hành động nếu có quân active và đó là quân của người chơi cục bộ
        if (!currentActiveUnitIdSketch || currentActiveUnitOwnerSketch !== localPlayerSide) {
            // Nếu click vào quân của mình mà nó đang active (dù chưa selected) thì select nó
            const canvasClickedRowPre = Math.floor(p.mouseY / TILE_SIZE);
            let clickedLogicRowPre = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - canvasClickedRowPre) : canvasClickedRowPre;
            const clickedLogicColPre = Math.floor(p.mouseX / TILE_SIZE);
            const unitUnderMouse = findUnitAt(clickedLogicColPre, clickedLogicRowPre);
            if (unitUnderMouse && unitUnderMouse.id === currentActiveUnitIdSketch && unitUnderMouse.owner === localPlayerSide) {
                 selectUnit(unitUnderMouse);
            } else {
                resetSelection(); // Bỏ chọn nếu click linh tinh khi không phải lượt quân mình
            }
            p.redraw();
            return;
        }

        const canvasClickedRow = Math.floor(p.mouseY / TILE_SIZE);
        let clickedLogicRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - canvasClickedRow) : canvasClickedRow;
        const clickedLogicCol = Math.floor(p.mouseX / TILE_SIZE);
        const clickedUnitObject = findUnitAt(clickedLogicCol, clickedLogicRow);

        // Nếu người chơi đã chọn quân active của mình
        if (selectedUnitId && selectedUnitId === currentActiveUnitIdSketch) {
            const currentSelectedUnit = findUnitById(selectedUnitId); // Phải là active unit
             if (!currentSelectedUnit || currentSelectedUnit.hp <= 0) { resetSelection(); p.redraw(); return; }

            // Kiểm tra trạng thái hành động của quân active từ server
            const activeUnitState = currentGameState.activeUnitActionState || { moved: false, attacked: false };

            // Nếu đã tấn công, không làm gì thêm
            if (activeUnitState.attacked) {
                if (!clickedUnitObject || clickedUnitObject.id !== selectedUnitId) resetSelection(); // Bỏ chọn nếu click chỗ khác
                p.redraw();
                return;
            }

            // 1. Thử tấn công
            if (clickedUnitObject && clickedUnitObject.owner !== localPlayerSide && clickedUnitObject.hp > 0) {
                const isAttackable = possibleAttacks.some(atkTarget => atkTarget.id === clickedUnitObject.id);
                if (isAttackable) {
                    window.attemptAttack(selectedUnitId, clickedUnitObject.id);
                    // Server sẽ update, và updateGameState sẽ gọi lại calculatePossibleActions
                    // Nếu tấn công thành công, activeUnitState.attacked sẽ là true, calculatePossibleActions sẽ rỗng
                    return;
                }
            }
            // 2. Thử di chuyển (chỉ khi chưa di chuyển)
            else if (!clickedUnitObject && !activeUnitState.moved) {
                const isMovable = possibleMoves.some(move => move.x === clickedLogicCol && move.y === clickedLogicRow);
                if (isMovable) {
                    window.attemptMove(selectedUnitId, clickedLogicRow, clickedLogicCol);
                    // Server sẽ update, calculatePossibleActions sẽ tính lại (sẽ không còn move, chỉ còn attack nếu có)
                    return;
                }
            }
            // Nếu click vào chính nó hoặc chỗ không hợp lệ, không thay đổi lựa chọn (vẫn giữ selectedUnitId)
            // (Trừ khi muốn bỏ chọn nếu click vào ô trống không phải là possibleMove)
            if (!clickedUnitObject && !possibleMoves.some(m => m.x === clickedLogicCol && m.y === clickedLogicRow) &&
                !possibleAttacks.some(a => a.x === clickedLogicCol && a.y === clickedLogicRow)) {
                 // resetSelection(); // Tùy chọn: bỏ chọn nếu click vào ô trống hoàn toàn không hợp lệ
            }

        } else { // Chưa có quân nào được chọn (selectedUnitId là null) HOẶC quân đang chọn không phải active unit
                 // Chỉ cho phép chọn nếu click vào chính quân đang active
            if (clickedUnitObject && clickedUnitObject.id === currentActiveUnitIdSketch && clickedUnitObject.owner === localPlayerSide && clickedUnitObject.hp > 0) {
                selectUnit(clickedUnitObject);
            } else {
                resetSelection(); // Nếu click vào chỗ khác, bỏ chọn
            }
        }
        p.redraw();
    };

    function selectUnit(unit) {
        if (unit.id !== currentActiveUnitIdSketch || unit.owner !== localPlayerSide) {
            // Chỉ cho phép "chọn" (để xem range, v.v.) quân đang active và là của mình
            resetSelection();
            return;
        }
        selectedUnitId = unit.id;
        console.log(`p5: Selected active unit ${unit.id}`);
        calculatePossibleActions(unit);
    }

    function resetSelection() {
        selectedUnitId = null;
        possibleMoves = [];
        possibleAttacks = [];
    }

    function findUnitAt(col, row) { // Nhận tọa độ logic
        if (!currentGameState || !currentGameState.units) return null;
        return currentGameState.units.find(u => u.x === col && u.y === row && u.hp > 0);
    }

    function findUnitById(unitId) { // Giữ nguyên
        if (!currentGameState || !currentGameState.units) return null;
        return currentGameState.units.find(u => u.id === unitId);
    }

    function calculatePossibleActions(unit) { // unit này phải là active unit
        possibleMoves = [];
        possibleAttacks = [];

        if (!unit || unit.id !== currentActiveUnitIdSketch || !currentGameState || unit.hp <= 0 ) {
            return;
        }

        const activeUnitState = currentGameState.activeUnitActionState || { moved: false, attacked: false };

        if (activeUnitState.attacked) { // Nếu đã tấn công, không còn hành động nào
            return;
        }

        const { x: startX, y: startY, speed, range, type, cannotAttackAdjacent } = unit;

        // Tính các nước đi có thể, chỉ khi quân CHƯA di chuyển trong lượt kích hoạt này
        if (!activeUnitState.moved) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const dist = Math.abs(startX - c) + Math.abs(startY - r);
                    if (dist > 0 && dist <= speed && !findUnitAt(c, r)) {
                        possibleMoves.push({ x: c, y: r });
                    }
                }
            }
        }

        // Tính các mục tiêu tấn công có thể (từ vị trí hiện tại của quân)
        // Quân có thể tấn công dù đã di chuyển hay chưa (miễn là chưa tấn công trong lượt kích hoạt này)
        currentGameState.units.forEach(targetUnit => {
            if (targetUnit.owner !== localPlayerSide && targetUnit.id !== unit.id && targetUnit.hp > 0) {
                const distToTarget = Math.abs(startX - targetUnit.x) + Math.abs(startY - targetUnit.y);
                if (distToTarget <= range) {
                    if (type === 'Ranger' && cannotAttackAdjacent && distToTarget <= 1) {
                        // Ranger constraint
                    } else {
                        possibleAttacks.push({ id: targetUnit.id, x: targetUnit.x, y: targetUnit.y });
                    }
                }
            }
        });
    }

    p.resetGame = function() {
        currentGameState = null;
        localPlayerSide = -1;
        selectedUnitId = null;
        possibleMoves = [];
        possibleAttacks = [];
        currentActiveUnitIdSketch = null;
        currentActiveUnitOwnerSketch = -1;
        p.clear();
        if (p.isLooping()) { // Chỉ gọi noLoop nếu đang loop
             p.noLoop();
        }
        console.log("p5: Game reset and draw loop stopped.");
    };
};
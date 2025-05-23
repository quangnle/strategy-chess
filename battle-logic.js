// battle-logic.js

const BOARD_COLS = 11;
const BOARD_ROWS = 11;

const UNIT_STATS = {
    TANKER: { speed: 1, hp: 5, range: 1, type: 'Tanker' },
    RANGER: { speed: 3, hp: 2, range: 4, type: 'Ranger', cannotAttackAdjacent: true },
    ASSASSIN: { speed: 4, hp: 3, range: 1, type: 'Assassin' },
    BASE: { hp: 5, type: 'Base', speed: 0, range: 0 } // Bases do not act
};

class Game {
    constructor() {
        this.units = []; // Danh sách tất cả các quân cờ và căn cứ
        this.bases = [ // Thông tin cố định của căn cứ
            { id: 'base-0', owner: 0, x: 5, y: 0, hp: UNIT_STATS.BASE.hp, maxHp: UNIT_STATS.BASE.hp, type: 'Base', speed: 0, range: 0 },
            { id: 'base-1', owner: 1, x: 5, y: 10, hp: UNIT_STATS.BASE.hp, maxHp: UNIT_STATS.BASE.hp, type: 'Base', speed: 0, range: 0 }
        ];
        this.units.push(...JSON.parse(JSON.stringify(this.bases))); // Thêm bản sao của base vào units

        this.winner = null;
        this.roundNumber = 0;
        this.initiativeQueue = [];      // Array of unit IDs, sắp xếp theo thứ tự hành động
        this.currentInitiativeIndex = -1; // Index của quân đang hành động trong initiativeQueue
        this.activeUnitId = null;       // ID của quân cờ đang được kích hoạt lượt
        // Trạng thái hành động { moved: boolean, attacked: boolean } của activeUnitId
        this.currentUnitActionState = { moved: false, attacked: false };

        // `startNewRound()` sẽ được gọi từ server.js sau khi `addInitialUnit` cho tất cả các quân.
    }

    addInitialUnit(unitData) {
        const stats = UNIT_STATS[unitData.type.toUpperCase()];
        if (!stats) {
            console.error("BattleLogic: Unknown unit type in addInitialUnit:", unitData.type);
            return;
        }
        const newUnit = {
            id: unitData.id,
            type: stats.type,
            x: unitData.x,
            y: unitData.y,
            hp: stats.hp,
            maxHp: stats.hp,
            speed: stats.speed,
            range: stats.range,
            owner: unitData.owner,
            cannotAttackAdjacent: !!stats.cannotAttackAdjacent,
        };
        this.units.push(newUnit);
    }

    getUnitById(unitId) {
        return this.units.find(u => u.id === unitId);
    }

    startNewRound() {
        this.roundNumber++;
        console.log(`BattleLogic: Starting Round ${this.roundNumber}`);

        // Lọc ra các quân cờ còn sống và không phải là base
        const livingActingUnits = this.units.filter(u => u.hp > 0 && u.type !== 'Base');

        if (livingActingUnits.length === 0) {
            console.log(`BattleLogic: Round ${this.roundNumber}: No living units to act. Game might be over or stalled.`);
            // Kiểm tra điều kiện thắng một lần nữa ở đây nếu cần,
            // mặc dù nó nên được kiểm tra sau mỗi hành động gây sát thương/chết.
            // Nếu không có quân nào hành động, activeUnitId sẽ là null.
            this.initiativeQueue = [];
            this.currentInitiativeIndex = 0; // Để điều kiện >= length được thỏa mãn ngay
            this.activeUnitId = null;
            this.currentUnitActionState = { moved: false, attacked: false };
            // Không gọi _activateNextUnit nếu queue rỗng
            return;
        }

        // Thêm một giá trị ngẫu nhiên để sắp xếp khi tốc độ bằng nhau
        const unitsWithRandomSort = livingActingUnits.map(unit => ({
            ...unit,
            _sortRandom: Math.random() // Thuộc tính tạm thời để sắp xếp
        }));

        unitsWithRandomSort.sort((a, b) => {
            if (b.speed !== a.speed) {
                return b.speed - a.speed; // Ưu tiên tốc độ cao hơn
            }
            return a._sortRandom - b._sortRandom; // Nếu tốc độ bằng nhau, sắp xếp ngẫu nhiên
        });

        this.initiativeQueue = unitsWithRandomSort.map(u => u.id);
        this.currentInitiativeIndex = -1; // Sẽ được tăng lên 0 khi _activateNextUnit được gọi lần đầu
        this.activeUnitId = null;
        this.currentUnitActionState = { moved: false, attacked: false };

        console.log(`BattleLogic: Initiative Order for Round ${this.roundNumber}: ${this.initiativeQueue.map(id => `${this.getUnitById(id)?.type}-${id.slice(-1)} (Spd ${this.getUnitById(id)?.speed})`).join(", ")}`);
        this._activateNextUnit(); // Kích hoạt quân đầu tiên trong round mới
    }

    _activateNextUnit() {
        this.currentInitiativeIndex++;

        if (this.currentInitiativeIndex >= this.initiativeQueue.length) {
            // Đã hết các quân trong hàng đợi của round hiện tại
            console.log("BattleLogic: All units in queue have acted for round " + this.roundNumber);
            this.startNewRound(); // Bắt đầu một round mới
            return;
        }

        this.activeUnitId = this.initiativeQueue[this.currentInitiativeIndex];
        const activeUnit = this.getUnitById(this.activeUnitId);

        // Nếu quân cờ đã chết trong lúc chờ lượt (ví dụ do hiệu ứng nào đó - hiện tại chưa có)
        // hoặc không tìm thấy, chuyển sang quân tiếp theo.
        if (!activeUnit || activeUnit.hp <= 0) {
            console.log(`BattleLogic: Skipping dead or invalid unit ${this.activeUnitId} in initiative.`);
            this._activateNextUnit(); // Đệ quy để tìm quân hợp lệ tiếp theo
            return;
        }

        // Reset trạng thái hành động cho quân cờ mới được kích hoạt
        this.currentUnitActionState = { moved: false, attacked: false };
        console.log(`BattleLogic: Activating unit: ${activeUnit.type} (ID: ${this.activeUnitId}, Owner: ${activeUnit.owner}, Spd: ${activeUnit.speed})`);
    }

    // Được gọi khi một quân cờ hoàn thành tất cả hành động của nó trong lượt kích hoạt này
    _finishUnitActivation() {
        if (!this.activeUnitId) {
            console.warn("BattleLogic: _finishUnitActivation called but no active unit.");
            return;
        }
        console.log(`BattleLogic: Unit ${this.activeUnitId} finished its activation.`);
        const previouslyActiveUnitId = this.activeUnitId; // Lưu lại để reference nếu cần
        this.activeUnitId = null; // Đánh dấu không còn quân nào đang "trong quá trình" thực hiện hành động nữa
                                 // Cho đến khi _activateNextUnit set quân mới
        this._activateNextUnit(); // Chuyển sang quân cờ tiếp theo
    }

    // Được gọi từ server.js khi client gửi yêu cầu 'finishUnitAction'
    requestFinishUnitAction(requestingUnitId) {
        if (requestingUnitId !== this.activeUnitId) {
            return { success: false, message: "Không phải lượt của quân này để kết thúc hành động." };
        }
        // Nếu quân đã tấn công, lượt của nó đã tự động kết thúc bởi logic trong attackUnit.
        if (this.currentUnitActionState.attacked) {
            return { success: false, message: "Quân này đã tấn công, hành động đã tự động kết thúc." };
        }
        // Người chơi chọn kết thúc hành động (ví dụ: sau khi di chuyển và không muốn/không thể tấn công,
        // hoặc chọn không làm gì cả với quân đang active)
        this._finishUnitActivation();
        return { success: true };
    }

    moveUnit(unitId, targetCol, targetRow, playerSideAttempting) {
        if (unitId !== this.activeUnitId) {
            return { success: false, message: "Không phải lượt của quân này." };
        }
        const unit = this.getUnitById(unitId);
        if (!unit) return { success: false, message: "Không tìm thấy quân cờ." };
        if (unit.owner !== playerSideAttempting) {
             return { success: false, message: "Bạn không thể điều khiển quân của đối phương." };
        }

        if (this.currentUnitActionState.attacked) {
            return { success: false, message: "Quân này đã tấn công, không thể di chuyển." };
        }
        if (this.currentUnitActionState.moved) {
            return { success: false, message: "Quân này đã di chuyển trong lượt kích hoạt này rồi." };
        }

        // --- Validation cho di chuyển ---
        if (targetCol < 0 || targetCol >= BOARD_COLS || targetRow < 0 || targetRow >= BOARD_ROWS) {
            return { success: false, message: "Mục tiêu nằm ngoài bàn cờ." };
        }
        const occupyingUnit = this.units.find(u => u.x === targetCol && u.y === targetRow && u.hp > 0);
        if (occupyingUnit) {
            return { success: false, message: `Ô mục tiêu đã có quân ${occupyingUnit.type} (ID: ${occupyingUnit.id}).` };
        }
        const dist = Math.abs(unit.x - targetCol) + Math.abs(unit.y - targetRow);
        if (dist === 0) return { success: false, message: "Quân cờ phải di chuyển đến ô khác."};
        if (dist > unit.speed) {
            return { success: false, message: "Mục tiêu quá xa ("+dist+" > "+unit.speed+")." };
        }

        // Thực hiện di chuyển
        console.log(`BattleLogic: Unit ${unit.id} moving from (${unit.x},${unit.y}) to (${targetCol},${targetRow})`);
        unit.x = targetCol;
        unit.y = targetRow;
        this.currentUnitActionState.moved = true;

        // "sau khi di chuyển nếu không có quân thù thì hết lượt."
        const enemiesInRangeAfterMove = this.getEnemiesInRange(unit);
        if (enemiesInRangeAfterMove.length === 0) {
            console.log(`BattleLogic: Unit ${this.activeUnitId} moved to (${unit.x},${unit.y}) and no targets in range. Finishing activation automatically.`);
            this._finishUnitActivation();
        }
        // Nếu có mục tiêu, server sẽ chờ client gửi lệnh attack hoặc requestFinishUnitAction

        return {
            success: true,
            message: "Di chuyển thành công.",
            // autoFinishedActivation: enemiesInRangeAfterMove.length === 0 // Client có thể dùng thông tin này
        };
    }

    attackUnit(attackerId, targetId, playerSideAttempting) {
        if (attackerId !== this.activeUnitId) {
            return { success: false, message: "Không phải lượt của quân này để tấn công." };
        }
        const attacker = this.getUnitById(attackerId);
        const target = this.getUnitById(targetId);

        if (!attacker) return { success: false, message: "Không tìm thấy quân tấn công." };
        if (attacker.owner !== playerSideAttempting) {
             return { success: false, message: "Bạn không thể điều khiển quân của đối phương để tấn công." };
        }
        if (this.currentUnitActionState.attacked) {
            return { success: false, message: "Quân này đã tấn công trong lượt kích hoạt này rồi." };
        }

        if (!target) return { success: false, message: "Không tìm thấy mục tiêu." };
        if (target.owner === attacker.owner) return { success: false, message: "Không thể tấn công quân mình." };
        if (attacker.type === 'Base') return { success: false, message: "Căn cứ không thể tấn công." };
        if (target.hp <= 0) return { success: false, message: "Mục tiêu đã bị tiêu diệt."};

        const dist = Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y);
        if (dist > attacker.range) {
            return { success: false, message: "Mục tiêu ngoài tầm đánh." };
        }
        if (attacker.type === 'Ranger' && attacker.cannotAttackAdjacent && dist <= 1) {
            return { success: false, message: "Ranger không thể tấn công mục tiêu liền kề." };
        }

        // Thực hiện tấn công
        console.log(`BattleLogic: Unit ${attacker.id} attacking unit ${target.id}`);
        target.hp -= 1; // Mất 1 máu mỗi đòn đánh
        this.currentUnitActionState.attacked = true; // Đánh dấu đã tấn công

        let targetDiedMessage = "";
        if (target.hp <= 0) {
            target.hp = 0; // Đảm bảo máu không âm
            targetDiedMessage = `${target.type} (ID: ${target.id}) của phe ${target.owner+1} đã bị tiêu diệt!`;
            console.log(`BattleLogic: ${targetDiedMessage}`);
            // Không xóa unit ngay, getState sẽ lọc ra các unit hp > 0
        }

        // Tấn công luôn kết thúc lượt kích hoạt của quân cờ
        const attackerUnitType = attacker.type; // Lưu lại trước khi activeUnitId có thể thay đổi
        this._finishUnitActivation();

        const winCheck = this.checkWinConditions();
        if (winCheck.gameOver) {
            this.winner = winCheck.winner;
            return {
                success: true,
                message: `${attackerUnitType} tấn công. HP mục tiêu còn: ${target.hp}. ${targetDiedMessage}`,
                gameOver: true,
                winner: this.winner,
                winReason: winCheck.message
            };
        }

        return {
            success: true,
            message: `${attackerUnitType} tấn công. HP mục tiêu còn: ${target.hp}. ${targetDiedMessage}`
        };
    }

    getEnemiesInRange(attacker) {
        const enemies = [];
        this.units.forEach(potentialTarget => {
            if (potentialTarget.hp > 0 && potentialTarget.owner !== attacker.owner && potentialTarget.type !== 'Base') { // Không tấn công base địch trực tiếp? Hay có? Hiện tại là không.
                const dist = Math.abs(attacker.x - potentialTarget.x) + Math.abs(attacker.y - potentialTarget.y);
                if (dist <= attacker.range) {
                    if (attacker.type === 'Ranger' && attacker.cannotAttackAdjacent && dist <= 1) {
                        // Skip
                    } else {
                        enemies.push(potentialTarget);
                    }
                }
            }
        });
        return enemies;
    }

    checkWinConditions() {
        // Điều kiện 1: Phá hủy căn cứ đối phương
        const base0 = this.units.find(u => u.id === 'base-0');
        const base1 = this.units.find(u => u.id === 'base-1');

        if (base0 && base0.hp <= 0) {
            return { gameOver: true, winner: 1, message: `Căn cứ của Người chơi 1 (Phe ${base0.owner + 1}) bị phá hủy! Người chơi 2 (Phe 1) thắng.` };
        }
        if (base1 && base1.hp <= 0) {
            return { gameOver: true, winner: 0, message: `Căn cứ của Người chơi 2 (Phe ${base1.owner + 1}) bị phá hủy! Người chơi 1 (Phe 0) thắng.` };
        }

        // Lấy danh sách quân (không phải base) còn sống của mỗi phe
        const player0Units = this.units.filter(u => u.owner === 0 && u.type !== 'Base' && u.hp > 0);
        const player1Units = this.units.filter(u => u.owner === 1 && u.type !== 'Base' && u.hp > 0);

        // Kiểm tra xem ban đầu họ có quân không (để tránh thắng ngay nếu đối phương không chọn quân nào)
        const player0HadUnitsInitially = this.units.some(u => u.owner === 0 && u.type !== 'Base');
        const player1HadUnitsInitially = this.units.some(u => u.owner === 1 && u.type !== 'Base');

        if (player0HadUnitsInitially && player0Units.length === 0) {
            return { gameOver: true, winner: 1, message: `Tất cả quân của Người chơi 1 (Phe 0) bị tiêu diệt! Người chơi 2 (Phe 1) thắng.` };
        }
        if (player1HadUnitsInitially && player1Units.length === 0) {
            return { gameOver: true, winner: 0, message: `Tất cả quân của Người chơi 2 (Phe 1) bị tiêu diệt! Người chơi 1 (Phe 0) thắng.` };
        }

        return { gameOver: false };
    }

    getState() {
        // Lọc ra các unit còn sống để gửi cho client, base thì luôn gửi dù hp <= 0 (để biết trạng thái)
        const unitsToSend = this.units.filter(u => u.hp > 0 || u.type === 'Base');

        return {
            boardCols: BOARD_COLS,
            boardRows: BOARD_ROWS,
            units: JSON.parse(JSON.stringify(unitsToSend)),
            roundNumber: this.roundNumber,
            initiativeQueue: [...this.initiativeQueue],
            currentInitiativeIndex: this.currentInitiativeIndex, // Client có thể dùng để hiển thị queue
            activeUnitId: this.activeUnitId,
            activeUnitActionState: this.activeUnitId ? { ...this.currentUnitActionState } : null,
            winner: this.winner,
        };
    }
}

module.exports = { Game, UNIT_STATS };
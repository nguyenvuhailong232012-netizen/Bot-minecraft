const mineflayer = require('mineflayer');
const readline = require('readline');
const Vec3 = require('vec3');

// Tự động nạp pathfinder nếu có
let pathfinder, Movements, goals;
try {
  const pf = require('mineflayer-pathfinder');
  pathfinder = pf.pathfinder;
  Movements = pf.Movements;
  goals = pf.goals;
} catch (e) {}

process.setMaxListeners(30);

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function (...args) {
  const str = args.join(' ');
  if (str.includes('Chunk size') || str.includes('partial packet') || str.includes('buffer :')) return;
  originalConsoleLog.apply(console, args);
};

console.error = function (...args) {
  const str = args.join(' ');
  if (str.includes('Chunk size') || str.includes('partial packet')) return;
  originalConsoleError.apply(console, args);
};

// BẢNG HƯỚNG DẪN KHI GÕ HELP TRÊN CONSOLE
function printHelpMenu() {
  console.log('\n========================================');
  console.log('🤖 HỆ THỐNG ĐIỀU KHIỂN BOT VIP');
  console.log('========================================');
  console.log(' 🚶 Di chuyển   : w, s, a, d [giây], nhay, ngoi, unngoi, dung');
  console.log('                : ditheo [tên], dungditheo, nhintheo [tên], dungnhin');
  console.log(' 🚀 Teleport    : tpa [tên], tpaccept, afkzone');
  console.log(' ⛏️ Khai thác   : daoblock [tên_block], daotoado [x y z]');
  console.log('                : daovung [x1 y1 z1 x2 y2 z2]');
  console.log(' 🏗️ Xây dựng    : xayvung [x1 y1 z1 x2 y2 z2 block hollow?]');
  console.log('                : thayvung [x1 y1 z1 x2 y2 z2 block_cu block_moi]');
  console.log('                : xaytron [x y z ban_kinh block]');
  console.log(' ⚔️ Combat      : sanquai [tên_quái], dungsanquai, danh');
  console.log(' ♻️ Auto Farm   : farm [x1 y1 z1 x2 y2 z2], dungfarm');
  console.log(' 🎒 Túi đồ      : inv, hotbar [1-9], vut, vut1, click [slot], dongruong, chuotphai, an');
  console.log(' ℹ️ Hệ thống    : info, shards, players, exit, help');
  console.log('========================================\n');
}

function extractCleanChat(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  let text = '';
  if (typeof node.text === 'string') text += node.text;
  if (node.extra && Array.isArray(node.extra)) {
    node.extra.forEach(child => { text += extractCleanChat(child); });
  }
  return text;
}

let totalShards = 0;
let lastDailyTime = 0; 
const DAILY_COOLDOWN = 12 * 60 * 60 * 1000;

function createBot() {
  console.log('[SERVER] ⚙️ Đang kết nối tới gemsmp.club...');

  let isInitialized = false;
  let lookTargetName = null;
  let followTargetName = null;
  let farmCoords = null;
  let isFarming = false;
  let isExecutingTask = false; 
  let huntTargetType = null;

  const bot = mineflayer.createBot({
    host: 'gemsmp.club',
    port: 25565,
    username: 'longbuonba2',
    version: '1.20.1',
    connectTimeout: 20000,
    checkTimeoutInterval: 60000,
  });

  if (pathfinder) bot.loadPlugin(pathfinder);

  bot._client.on('resource_pack_send', () => {
    bot._client.write('resource_pack_receive', { result: 0 });
  });

  async function placeBlockSafe(x, y, z, blockName) {
    const item = bot.inventory.items().find(i => i.name.includes(blockName.toLowerCase()));
    if (!item) return false;

    const targetPos = new Vec3(x, y, z);
    const blockAtPos = bot.blockAt(targetPos);
    if (blockAtPos && blockAtPos.name !== 'air' && blockAtPos.name !== 'water') return true;

    const faces = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)];
    let refBlock = null;
    let faceVector = null;

    for (let offset of faces) {
      const adjBlock = bot.blockAt(targetPos.plus(offset));
      if (adjBlock && adjBlock.name !== 'air' && adjBlock.name !== 'water') {
        refBlock = adjBlock;
        faceVector = offset.scaled(-1); 
        break;
      }
    }

    if (!refBlock) return false;

    try {
      await bot.equip(item, 'hand');
      if (pathfinder) await bot.pathfinder.goto(new goals.GoalPlaceBlock(targetPos, bot.world, {}));
      await bot.placeBlock(refBlock, faceVector);
      return true;
    } catch (e) { return false; }
  }

  // ==========================================
  // HỆ THỐNG XỬ LÝ LỆNH TRÊN TERMINAL (CONSOLE)
  // ==========================================
  async function handleCommand(rawInput) {
    const parts = rawInput.trim().split(' ');
    const text = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();
    const args = parts.slice(1);

    if (text === 'exit' || text === 'quit') {
      console.log('[CONTROL] 🛑 Đang thoát chương trình...');
      process.exit(0);
    } else if (text === 'help') {
      printHelpMenu();
    } else if (text === 'info') {
      const pos = bot.entity.position;
      console.log(`[INFO] 📍 X:${pos.x.toFixed(1)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(1)} | ❤️ Máu: ${bot.health} | 🍖 Đói: ${bot.food}`);
    } else if (text === 'shards') {
      console.log(`[SHARD] 💎 Tổng số shard bot đã tích lũy: ${totalShards}`);
    } else if (text === 'players') {
      const playerNames = Object.keys(bot.players).join(', ');
      console.log(`[PLAYERS] 👥 Người chơi online (${Object.keys(bot.players).length}): ${playerNames}`);
    } else if (['w', 's', 'a', 'd'].includes(text)) {
      const stateMapping = { 'w': 'forward', 's': 'back', 'a': 'left', 'd': 'right' };
      bot.setControlState(stateMapping[text], true);
      const duration = parseInt(arg, 10);
      if (!isNaN(duration) && duration > 0) {
        console.log(`[CONTROL] 🚶 Đang đi hướng '${text}' trong ${duration}s`);
        setTimeout(() => bot.setControlState(stateMapping[text], false), duration * 1000);
      } else {
        console.log(`[CONTROL] 🚶 Đang đi hướng '${text}'. Gõ 'dung' để dừng.`);
      }
    } else if (text === 'nhay') {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 500);
      console.log('[CONTROL] 🦘 Đã nhảy!');
    } else if (text === 'ngoi') {
      bot.setControlState('sneak', true);
      console.log('[CONTROL] 🧎 Đã ngồi.');
    } else if (text === 'unngoi') {
      bot.setControlState('sneak', false);
      console.log('[CONTROL] 🚶 Đã đứng.');
    } else if (text === 'dung') {
      lookTargetName = followTargetName = huntTargetType = null;
      isFarming = false;
      bot.clearControlStates();
      if (pathfinder) bot.pathfinder.setGoal(null);
      console.log('[CONTROL] 🛑 Đã dừng MỌI hoạt động!');
    } else if (text === 'nhintheo' || text === 'ditheo' || text === 'nhin') {
      const target = arg || 'nearest';
      if (text.includes('nhin')) { 
        lookTargetName = target; 
        console.log(`[CONTROL] 👀 Đang nhìn theo: ${target}`); 
      } else { 
        followTargetName = target; 
        console.log(`[CONTROL] 🏃 Đang đi theo: ${target}`); 
      }
    } else if (text === 'dungditheo') {
      followTargetName = null;
      if (pathfinder) bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      console.log('[CONTROL] 🛑 Đã dừng đi theo.');
    } else if (text === 'dungnhin') {
      lookTargetName = null;
      console.log('[CONTROL] 👁️ Đã dừng nhìn.');
    } else if (text === 'tpa') {
      if (!arg) return console.log('⚠️ Dùng: tpa [tên_người_chơi]');
      bot.chat(`/tpa ${arg}`);
      console.log(`[CONTROL] 🚀 Đã gửi yêu cầu TPA tới ${arg}`);
    } else if (text === 'tpaccept' || text === 'tpacc') {
      bot.chat('/tpaccept');
      console.log('[CONTROL] ✅ Đã chấp nhận dịch chuyển!');
    } else if (text === 'afkzone' || text === 'afk') {
      bot.chat('/afkzone');
      console.log('[CONTROL] 🌀 Đang chuyển về AFK Zone...');
    } else if (text === 'danh') {
      const filter = e => e.type === 'mob' || e.type === 'player';
      const entity = bot.nearestEntity(filter);
      if (entity) {
        bot.attack(entity, true);
        console.log(`[CONTROL] ⚔️ Đã đánh mục tiêu gần nhất: ${entity.username || entity.name}`);
      } else {
        console.log('[CONTROL] ⚠️ Không thấy mục tiêu nào ở gần để đánh!');
      }
    } else if (text === 'daoblock') {
      if (!arg) return console.log('⚠️ Dùng: daoblock [tên_block]');
      const targetBlock = bot.findBlock({ matching: b => b && b.name.includes(arg.toLowerCase()), maxDistance: 32 });
      if (!targetBlock) return console.log(`❌ Không tìm thấy block '${arg}' gần đây!`);
      console.log(`[CONTROL] ⛏️ Đang đào ${targetBlock.name}...`);
      try {
        if (pathfinder) await bot.pathfinder.goto(new goals.GoalGetToBlock(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z));
        await bot.dig(targetBlock);
        console.log('[CONTROL] ✅ Đã đào xong!');
      } catch (e) { console.log('[CONTROL] ❌ Lỗi khi đào!'); }
    } else if (text === 'daotoado') {
      if (args.length < 3) return console.log('⚠️ Dùng: daotoado x y z');
      const bx = parseInt(args[0]), by = parseInt(args[1]), bz = parseInt(args[2]);
      const targetBlock = bot.blockAt(new Vec3(bx, by, bz));
      if (!targetBlock || targetBlock.name === 'air') return console.log('❌ Tọa độ không có block!');
      try {
        if (pathfinder) await bot.pathfinder.goto(new goals.GoalGetToBlock(bx, by, bz));
        await bot.dig(targetBlock);
        console.log('[CONTROL] ✅ Đã đào xong!');
      } catch (e) { console.log('[CONTROL] ❌ Lỗi khi đào!'); }
    } else if (text === 'daovung') {
      if (args.length < 6) return console.log('⚠️ Dùng: daovung x1 y1 z1 x2 y2 z2');
      console.log('[CONTROL] ⛏️ Đang đào sạch khu vực...');
      isExecutingTask = true;
      const minX = Math.min(args[0], args[3]), minY = Math.min(args[1], args[4]), minZ = Math.min(args[2], args[5]);
      const maxX = Math.max(args[0], args[3]), maxY = Math.max(args[1], args[4]), maxZ = Math.max(args[2], args[5]);
      
      for(let y = maxY; y >= minY; y--) { 
        for(let x = minX; x <= maxX; x++) {
          for(let z = minZ; z <= maxZ; z++) {
             const b = bot.blockAt(new Vec3(x,y,z));
             if (b && b.name !== 'air' && b.name !== 'bedrock') {
                try {
                  if (pathfinder) await bot.pathfinder.goto(new goals.GoalGetToBlock(x, y, z));
                  await bot.dig(b);
                } catch(e) {}
             }
          }
        }
      }
      isExecutingTask = false;
      console.log('[CONTROL] ✅ Đã đào xong khu vực!');
    } else if (text === 'xayvung') {
      if (args.length < 7) return console.log('⚠️ Dùng: xayvung x1 y1 z1 x2 y2 z2 block [hollow]');
      const isHollow = args[7] === 'hollow';
      console.log(`[CONTROL] 🏗️ Xây khu vực ${isHollow ? '(rỗng)' : '(đặc)'}...`);
      isExecutingTask = true;
      const blockName = args[6];
      const minX = Math.min(args[0], args[3]), minY = Math.min(args[1], args[4]), minZ = Math.min(args[2], args[5]);
      const maxX = Math.max(args[0], args[3]), maxY = Math.max(args[1], args[4]), maxZ = Math.max(args[2], args[5]);

      for(let y = minY; y <= maxY; y++) {
        for(let x = minX; x <= maxX; x++) {
          for(let z = minZ; z <= maxZ; z++) {
             if (isHollow && !(x == minX || x == maxX || y == minY || y == maxY || z == minZ || z == maxZ)) continue; 
             await placeBlockSafe(x, y, z, blockName);
          }
        }
      }
      isExecutingTask = false;
      console.log('[CONTROL] ✅ Đã xây xong!');
    } else if (text === 'xaytron') {
      if (args.length < 5) return console.log('⚠️ Dùng: xaytron x y z ban_kinh block');
      const cx = parseInt(args[0]), cy = parseInt(args[1]), cz = parseInt(args[2]), r = parseInt(args[3]);
      isExecutingTask = true;
      for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
          if (Math.round(Math.sqrt(x*x + z*z)) === r) await placeBlockSafe(cx + x, cy, cz + z, args[4]);
        }
      }
      isExecutingTask = false;
      console.log('[CONTROL] ✅ Xây hình tròn xong!');
    } else if (text === 'sanquai') {
      if (!arg) return console.log('⚠️ Dùng: sanquai [tên]');
      huntTargetType = arg.toLowerCase();
      console.log(`[CONTROL] ⚔️ Bật đi săn: ${huntTargetType}`);
    } else if (text === 'dungsanquai') {
      huntTargetType = null;
      if (pathfinder) bot.pathfinder.setGoal(null);
      console.log('[CONTROL] 🛑 Đã dừng đi săn.');
    } else if (text === 'farm') {
      if (args.length < 6) return console.log('⚠️ Dùng: farm x1 y1 z1 x2 y2 z2');
      farmCoords = {
        minX: Math.min(args[0], args[3]), minY: Math.min(args[1], args[4]), minZ: Math.min(args[2], args[5]),
        maxX: Math.max(args[0], args[3]), maxY: Math.max(args[1], args[4]), maxZ: Math.max(args[2], args[5])
      };
      isFarming = true;
      console.log('[CONTROL] ♻️ Bật Auto Farm.');
    } else if (text === 'dungfarm') {
      isFarming = false;
      console.log('[CONTROL] 🛑 Đã tắt Auto Farm.');
    } else if (text === 'hotbar') {
      const slot = parseInt(arg, 10);
      if (slot >= 1 && slot <= 9) {
        bot.setQuickBarSlot(slot - 1);
        console.log(`[CONTROL] 🎒 Đã đổi sang hotbar ô số ${slot}`);
      }
    } else if (text === 'inv') {
      let invMsg = '📦 Kho chính (9-35):\n';
      for (let i = 9; i <= 35; i++) {
        const item = bot.inventory.slots[i];
        if (item) invMsg += `[Slot ${i}] ${item.name} x${item.count}\n`;
      }
      invMsg += '🖐️ Hotbar (1-9):\n';
      for (let i = 36; i <= 44; i++) {
        const item = bot.inventory.slots[i];
        if (item) invMsg += `[Slot ${i - 35}] ${item.name} x${item.count}\n`;
      }
      console.log(invMsg);
    } else if (text === 'vut' || text === 'vut1') {
      const item = bot.heldItem;
      if (!item) return console.log('❌ Không cầm đồ trên tay!');
      try {
        if (text === 'vut1') await bot.toss(item.type, null, 1);
        else await bot.tossStack(item);
        console.log(`[CONTROL] 🗑️ Đã vứt ${item.name}!`);
      } catch (e) { console.log('❌ Không vứt được!'); }
    } else if (text === 'click') {
      if (!arg) return console.log('⚠️ Dùng: click [slot]');
      const slot = parseInt(arg, 10);
      if (bot.currentWindow) {
        await bot.clickWindow(slot, 0, 0).catch(()=>{});
        console.log(`[CONTROL] 🖱️ Đã click ô ${slot}!`);
      } else console.log('❌ Không mở rương!');
    } else if (text === 'dongruong') {
      if (bot.currentWindow) {
        bot.closeWindow(bot.currentWindow);
        console.log('[CONTROL] 🚪 Đã đóng rương!');
      } else console.log('❌ Không mở rương!');
    } else if (text === 'chuotphai') {
      bot.activateItem(); 
      console.log('[CONTROL] 🤚 Đã bấm chuột phải.');
    } else if (text === 'an' || text === 'eat') {
      const item = bot.heldItem;
      if (!item) return console.log('❌ Chưa cầm đồ ăn!');
      console.log(`[CONTROL] 🍎 Đang ăn ${item.name}...`);
      try {
        await bot.consume();
        console.log('[CONTROL] 😋 Đã ăn xong!');
      } catch (e) {
        console.log('[CONTROL] ❌ Lỗi khi ăn!');
      }
    } else {
      bot.chat(rawInput);
      console.log(`[CHAT] ⌨️ Đã gửi: ${rawInput}`);
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (line) => handleCommand(line));

  bot.on('physicsTick', async () => {
    if (!bot.entity) return;

    if (lookTargetName !== null) {
      const targetEntity = lookTargetName === 'nearest' ? bot.nearestEntity(e => e.type === 'player' && e !== bot.entity) : bot.players[lookTargetName]?.entity;
      if (targetEntity) bot.lookAt(targetEntity.position.offset(0, 1.6, 0), true);
    }

    if (followTargetName !== null && pathfinder) {
       const targetEntity = followTargetName === 'nearest' ? bot.nearestEntity(e => e.type === 'player' && e !== bot.entity) : bot.players[followTargetName]?.entity;
       if (targetEntity) bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2), true);
    }

    if (huntTargetType && pathfinder && !isExecutingTask) {
      const mob = bot.nearestEntity(e => e.type === 'mob' && e.name.toLowerCase().includes(huntTargetType));
      if (mob) {
        const dist = bot.entity.position.distanceTo(mob.position);
        bot.pathfinder.setGoal(new goals.GoalFollow(mob, 2), true);
        if (dist <= 3) bot.attack(mob, true); 
      }
    }

    if (isFarming && farmCoords && !isExecutingTask) {
      isExecutingTask = true; 
      let foundBlock = null;

      for(let y = farmCoords.maxY; y >= farmCoords.minY; y--) {
        for(let x = farmCoords.minX; x <= farmCoords.maxX; x++) {
          for(let z = farmCoords.minZ; z <= farmCoords.maxZ; z++) {
            const b = bot.blockAt(new Vec3(x, y, z));
            if (b && b.name !== 'air' && b.name !== 'bedrock' && b.name !== 'water' && b.name !== 'lava') {
              foundBlock = b; 
              break;
            }
          }
          if(foundBlock) break;
        }
        if(foundBlock) break;
      }

      if (foundBlock) {
        try {
          if (pathfinder) await bot.pathfinder.goto(new goals.GoalGetToBlock(foundBlock.position.x, foundBlock.position.y, foundBlock.position.z));
          await bot.dig(foundBlock);
        } catch (e) {}
      }
      isExecutingTask = false; 
    }
  });

  bot.on('message', (jsonMsg) => {
    const rawText = extractCleanChat(jsonMsg);
    const fullText = rawText.replace(/\s+/g, ' ').trim();
    if (!fullText) return;
    const lowerMsg = fullText.toLowerCase();

    console.log(`[CHAT] 💬 ${fullText}`);

    const shardMatch = lowerMsg.match(/bạn đã nhận (\d+) shards từ afk/);
    if (shardMatch) {
      totalShards += parseInt(shardMatch[1], 10);
      console.log(`[SHARD] 💎 Tích lũy tổng cộng: ${totalShards} Shards`);
    }

    if ((lowerMsg.includes('login') || lowerMsg.includes('mật khẩu')) && !isInitialized) {
      bot.chat('/login long232012');
    }
    
    if ((lowerMsg.includes('successfully logged') || lowerMsg.includes('đã đăng nhập trước đó') || lowerMsg.includes('đã đăng nhập')) && !isInitialized) {
      isInitialized = true;
      console.log('[SYSTEM] 🚀 Đăng nhập thành công, chuẩn bị sang Eco...');
      setTimeout(() => bot.chat('/server eco'), 3000); 
      setTimeout(() => bot.chat('/afkzone'), 10000); 

      const now = Date.now();
      if (now - lastDailyTime >= DAILY_COOLDOWN) {
        setTimeout(() => {
          bot.chat('/daily');
          lastDailyTime = Date.now();
        }, 14000);
      }
    }
  });

  const dailyInterval = setInterval(() => {
    if (!isInitialized || !bot) return;
    const now = Date.now();
    if (now - lastDailyTime >= DAILY_COOLDOWN) {
      console.log('[SYSTEM] ⏳ Đã đủ 12 tiếng, tự động gửi /daily...');
      bot.chat('/daily');
      lastDailyTime = now;
    }
  }, 60000);

  // ==========================================
  // KHÔI PHỤC LOG HIỂN THỊ KHI MỞ RƯƠNG / DAILY
  // ==========================================
  bot.on('windowOpen', async (window) => {
    const titleStr = JSON.stringify(window.title || '').toLowerCase();
    console.log(`[CHEST] 📦 Đã mở rương/GUI mới! (Tiêu đề: ${titleStr})`);
    console.log('[CHEST] 📋 Danh sách các món đồ có trong rương này:');
    
    let hasItem = false;
    for (let i = 0; i < window.slots.length; i++) {
      const item = window.slots[i];
      if (item && !item.name.includes('air') && !item.name.includes('pane')) {
        hasItem = true;
        console.log(` - [Ô số ${i}] ${item.name} x${item.count}`);
      }
    }
    if (!hasItem) console.log(' - Rương trống!');

    if (titleStr.includes('daily') || titleStr.includes('điểm danh') || titleStr.includes('thưởng')) {
      console.log('[CHEST] ⚙️ Phát hiện menu /daily, đang tự động nhận quà...');
      setTimeout(async () => {
        try {
          let clicked = false;
          for (let i = 0; i < window.slots.length; i++) {
            const item = window.slots[i];
            if (!item) continue;
            
            const itemName = (item.name || '').toLowerCase();
            const itemData = JSON.stringify(item).toLowerCase();
            
            if (itemName.includes('pane') || itemName.includes('barrier') || itemName.includes('air')) continue;
            if (itemData.includes('đã nhận') || itemData.includes('claimed') || itemData.includes('khoá')) continue;
            
            await bot.clickWindow(i, 0, 0);
            clicked = true;
            console.log(`[CHEST] ✅ Đã nhận quà tại ô số ${i} [${item.name}]`);
            break; 
          }
          if (!clicked) console.log('[CHEST] ⚙️ Không có quà hợp lệ hoặc đã nhận hết hôm nay rồi!');
          setTimeout(() => {
            try { bot.closeWindow(window); } catch(e){}
          }, 1000);
        } catch (e) {
          console.log(`[CHEST] ⚠️ Lỗi click GUI: ${e.message}`);
        }
      }, 1500);
    }
  });

  setInterval(() => {
    if (bot.entity && lookTargetName === null) {
      bot.look(bot.entity.yaw + (Math.random() * 0.5 - 0.25), bot.entity.pitch, true);
    }
  }, 30000);

  bot.on('spawn', () => {
    setTimeout(() => printHelpMenu(), 1000);
    setTimeout(() => { if (!isInitialized) bot.chat('/login long232012'); }, 5000);
  });

  bot.on('end', () => {
    clearInterval(dailyInterval);
    rl.close();
    console.log('[SERVER] ⚠️ Bị văng! Tự kết nối lại sau 20s...');
    setTimeout(createBot, 20000);
  });
}

createBot();

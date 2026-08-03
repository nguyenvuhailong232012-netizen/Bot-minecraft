const http = require('http');
const server = http.createServer((req, res) => {
res.writeHead(200, { 'Content-Type': 'text/plain' });
res.end('Bot is running!\n');
});
server.listen(process.env.PORT || 3000);
​const mineflayer = require('mineflayer');
const Vec3 = require('vec3');
​let pathfinder, Movements, goals;
try {
const pf = require('mineflayer-pathfinder');
pathfinder = pf.pathfinder;
Movements = pf.Movements;
goals = pf.goals;
} catch (e) {}
​process.setMaxListeners(30);
​const originalConsoleLog = console.log;
const originalConsoleError = console.error;
​console.log = function (...args) {
const str = args.join(' ');
if (str.includes('Chunk size') || str.includes('partial packet') || str.includes('buffer :')) return;
originalConsoleLog.apply(console, args);
};
​console.error = function (...args) {
const str = args.join(' ');
if (str.includes('Chunk size') || str.includes('partial packet')) return;
originalConsoleError.apply(console, args);
};
​// BẢNG HƯỚNG DẪN ĐẦY ĐỦ
const HELP_LINES = [
"=== HỆ THỐNG ĐIỀU KHIỂN BOT VIP ===",
"🔹 Di chuyển: *^w [giây]^, *^s^, *^a^, *^d^, *^nhay^, *^ngoi^, *^dung^, *^ditheo [tên]^",
"🔹 Nhìn: *^nhintheo [tên]^, *^dungnhin^",
"🔹 Teleport: *^tpa [tên]^, *^tpaccept^, *^afkzone^",
"🔹 Đào & Xây: *^daoblock [tên]^, *^daotoado x y z^, *^daovung x1 y1 z1 x2 y2 z2^, *^xayvung...^, *^xaytron...^",
"🔹 Combat & Farm: *^sanquai [tên]^, *^dungsanquai^, *^danh [số nhát] [tên]^, *^dungdanh^, *^farm x1 y1 z1 x2 y2 z2^, *^dungfarm^",
"🔹 Kho đồ & Khác: *^inv^, *^hotbar [1-9]^, *^vut [SL] [Slot]^, *^vutall^, *^chuotphai^, *^an^, *^info^, *^shards^",
"🔹 Nói chuyện: Gõ *^Nội dung bất kỳ^ để bot nói ra công khai"
];
​function extractCleanChat(node) {
if (!node) return '';
if (typeof node === 'string') return node;
let text = '';
if (typeof node.text === 'string') text += node.text;
if (node.extra && Array.isArray(node.extra)) {
node.extra.forEach(child => { text += extractCleanChat(child); });
}
return text;
}
​let totalShards = 0;
let lastDailyTime = 0;
const DAILY_COOLDOWN = 12 * 60 * 60 * 1000;
​function createBot() {
console.log('[SERVER] ⚙️ Đang kết nối tới gemsmp.club trên Render Cloud...');
​let isInitialized = false;
let lookTargetName = null;
let followTargetName = null;
let farmCoords = null;
let isFarming = false;
let isExecutingTask = false;
let huntTargetType = null;
let isEating = false;
let customAttackTarget = null;
let remainingHits = 0;
​const bot = mineflayer.createBot({
host: 'gemsmp.club',
port: 25565,
username: 'longbuonba2',
version: '1.20.1',
connectTimeout: 20000,
checkTimeoutInterval: 60000,
});
​if (pathfinder) bot.loadPlugin(pathfinder);
​bot._client.on('resource_pack_send', () => {
bot._client.write('resource_pack_receive', { result: 0 });
});
​async function placeBlockSafe(x, y, z, blockName) {
const item = bot.inventory.items().find(i => i.name.includes(blockName.toLowerCase()));
if (!item) return false;
​const targetPos = new Vec3(x, y, z);
const blockAtPos = bot.blockAt(targetPos);
if (blockAtPos && blockAtPos.name !== 'air' && blockAtPos.name !== 'water') return true;
​const faces = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)];
let refBlock = null;
let faceVector = null;
​for (let offset of faces) {
const adjBlock = bot.blockAt(targetPos.plus(offset));
if (adjBlock && adjBlock.name !== 'air' && adjBlock.name !== 'water') {
refBlock = adjBlock;
faceVector = offset.scaled(-1);
break;
}
}
​if (!refBlock) return false;
​try {
await bot.equip(item, 'hand');
if (pathfinder) await bot.pathfinder.goto(new goals.GoalPlaceBlock(targetPos, bot.world, {}));
await bot.placeBlock(refBlock, faceVector);
return true;
} catch (e) { return false; }
}
​// Tự động ăn táo/đồ ăn đến khi đủ 40 máu, sau đó trả về hotbar cũ
async function autoEat() {
if (isEating || bot.health >= 40) return;
const food = bot.inventory.items().find(i => i.name.includes('apple') || i.name.includes('bread') || i.name.includes('golden') || i.name.includes('steak'));
if (!food) return;
​isEating = true;
const oldSlot = bot.quickBarSlot;
try {
while (bot.health < 40) {
const currentFood = bot.inventory.items().find(i => i.name.includes('apple') || i.name.includes('bread') || i.name.includes('golden') || i.name.includes('steak'));
if (!currentFood) break;
await bot.equip(currentFood, 'hand');
await bot.consume();
await bot.waitForTicks(10);
}
} catch (e) {}
bot.setQuickBarSlot(oldSlot);
isEating = false;
}
​// ==========================================
// XỬ LÝ LỆNH VÀ PHẢN HỒI RIÊNG TƯ QUA /MSG
// ==========================================
async function handleCommand(rawInput, sender) {
const parts = rawInput.trim().split(' ');
const text = parts[0].toLowerCase();
const arg = parts.slice(1).join(' ').trim();
const args = parts.slice(1);
​const sendMsg = (msg) => {
console.log([CMD REPLY to ${sender}] ${msg});
if (sender && sender !== 'console' && sender !== 'Ai_do') {
bot.chat(/msg ${sender} ${msg});
} else {
bot.chat(msg);
}
};
​if (text === 'help') {
HELP_LINES.forEach((line, index) => {
setTimeout(() => bot.chat(line), index * 400);
});
} else if (text === 'info') {
const pos = bot.entity.position;
sendMsg(📍 X:${pos.x.toFixed(1)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(1)} | ❤️ Máu: ${Math.round(bot.health)} | 🍖 Đói: ${Math.round(bot.food)});
} else if (text === 'shards') {
sendMsg(💎 Tổng số shard bot đã tích lũy: ${totalShards});
} else if (text === 'players') {
sendMsg(👥 Online (${Object.keys(bot.players).length}): ${Object.keys(bot.players).join(', ')});
} else if (['w', 's', 'a', 'd'].includes(text)) {
const stateMapping = { 'w': 'forward', 's': 'back', 'a': 'left', 'd': 'right' };
bot.setControlState(stateMapping[text], true);
const duration = parseInt(arg, 10);
if (!isNaN(duration) && duration > 0) {
sendMsg(🚶 Đang đi hướng '${text}' trong ${duration}s);
setTimeout(() => bot.setControlState(stateMapping[text], false), duration * 1000);
} else {
sendMsg(🚶 Đang đi hướng '${text}'. Gõ *^dung^ để dừng.);
}
} else if (text === 'nhay') {
bot.setControlState('jump', true);
setTimeout(() => bot.setControlState('jump', false), 500);
sendMsg('🦘 Đã nhảy!');
} else if (text === 'ngoi') {
bot.setControlState('sneak', true);
sendMsg('🧎 Đã ngồi.');
} else if (text === 'unngoi') {
bot.setControlState('sneak', false);
sendMsg('🚶 Đã đứng.');
} else if (text === 'dung') {
lookTargetName = followTargetName = huntTargetType = customAttackTarget = null;
remainingHits = 0;
isFarming = false;
bot.clearControlStates();
if (pathfinder) bot.pathfinder.setGoal(null);
sendMsg('🛑 Đã dừng mọi hoạt động!');
} else if (text === 'nhintheo' || text === 'ditheo') {
const target = arg || sender;
if (text.includes('nhin')) {
lookTargetName = target;
sendMsg(👀 Đang nhìn theo: ${target});
} else {
followTargetName = target;
sendMsg(🏃 Đang đi theo: ${target});
}
} else if (text === 'dungditheo') {
followTargetName = null;
if (pathfinder) bot.pathfinder.setGoal(null);
bot.clearControlStates();
sendMsg('🛑 Đã dừng đi theo.');
} else if (text === 'dungnhin') {
lookTargetName = null;
sendMsg('👁️ Đã dừng nhìn.');
} else if (text === 'tpa') {
if (!arg) return sendMsg('⚠️ Dùng: *^tpa [tên]^');
bot.chat(/tpa ${arg});
sendMsg(🚀 Đã gửi yêu cầu TPA tới ${arg});
} else if (text === 'tpaccept' || text === 'tpacc') {
bot.chat('/tpaccept');
sendMsg('✅ Đã chấp nhận dịch chuyển!');
} else if (text === 'afkzone' || text === 'afk') {
bot.chat('/afkzone');
sendMsg('🌀 Đang chuyển về AFK Zone...');
} else if (text === 'danh') {
remainingHits = parseInt(args[0]) || 1;
const targetName = args[1] ? args[1].toLowerCase() : null;
​if (targetName) {
customAttackTarget = bot.players[targetName]?.entity || bot.entities[targetName];
} else {
customAttackTarget = bot.nearestEntity(e => e.type === 'mob' || e.type === 'player');
}
​if (customAttackTarget) {
sendMsg(⚔️ Sẽ chém mục tiêu ${remainingHits} nhát!);
} else {
sendMsg('⚠️ Không tìm thấy mục tiêu để đánh!');
remainingHits = 0;
}
} else if (text === 'dungdanh') {
customAttackTarget = null;
remainingHits = 0;
sendMsg('🛑 Đã dừng tấn công.');
} else if (text === 'daoblock') {
if (!arg) return sendMsg('⚠️ Dùng: *^daoblock [tên_block]^');
const targetBlock = bot.findBlock({ matching: b => b && b.name.includes(arg.toLowerCase()), maxDistance: 32 });
if (!targetBlock) return sendMsg(❌ Không tìm thấy block '${arg}' gần đây!);
sendMsg(⛏️ Đang đào ${targetBlock.name}...);
try {
if (pathfinder) await bot.pathfinder.goto(new goals.GoalGetToBlock(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z));
await bot.dig(targetBlock);
sendMsg('✅ Đã đào xong!');
} catch (e) { sendMsg('❌ Lỗi khi đào!'); }
} else if (text === 'daotoado') {
if (args.length < 3) return sendMsg('⚠️ Dùng: *^daotoado x y z^');
const bx = parseInt(args[0]), by = parseInt(args[1]), bz = parseInt(args[2]);
const targetBlock = bot.blockAt(new Vec3(bx, by, bz));
if (!targetBlock || targetBlock.name === 'air') return sendMsg('❌ Tọa độ không có block!');
try {
if (pathfinder) await bot.pathfinder.goto(new goals.GoalGetToBlock(bx, by, bz));
await bot.dig(targetBlock);
sendMsg('✅ Đã đào xong!');
} catch (e) { sendMsg('❌ Lỗi khi đào!'); }
} else if (text === 'daovung') {
if (args.length < 6) return sendMsg('⚠️ Dùng: *^daovung x1 y1 z1 x2 y2 z2^');
sendMsg('⛏️ Đang đào sạch khu vực...');
isExecutingTask = true;
const minX = Math.min(args[0], args[3]), minY = Math.min(args[1], args[4]), minZ = Math.min(args[2], args[5]);
const maxX = Math.max(args[0], args[3]), maxY = Math.max(args[1], args[4]), maxZ = Math.max(args[2], args[5]);
​for(let y = maxY; y >= minY; y--) {
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
sendMsg('✅ Đã đào xong khu vực!');
} else if (text === 'xayvung') {
if (args.length < 7) return sendMsg('⚠️ Dùng: *^xayvung x1... block [hollow]^');
const isHollow = args[7] === 'hollow';
sendMsg(🏗️ Xây khu vực ${isHollow ? '(rỗng)' : '(đặc)'}...);
isExecutingTask = true;
const blockName = args[6];
const minX = Math.min(args[0], args[3]), minY = Math.min(args[1], args[4]), minZ = Math.min(args[2], args[5]);
const maxX = Math.max(args[0], args[3]), maxY = Math.max(args[1], args[4]), maxZ = Math.max(args[2], args[5]);
​for(let y = minY; y <= maxY; y++) {
for(let x = minX; x <= maxX; x++) {
for(let z = minZ; z <= maxZ; z++) {
if (isHollow && !(x == minX || x == maxX || y == minY || y == maxY || z == minZ || z == maxZ)) continue;
await placeBlockSafe(x, y, z, blockName);
}
}
}
isExecutingTask = false;
sendMsg('✅ Đã xây xong!');
} else if (text === 'xaytron') {
if (args.length < 5) return sendMsg('⚠️ Dùng: ^xaytron x y z r block^');
const cx = parseInt(args[0]), cy = parseInt(args[1]), cz = parseInt(args[2]), r = parseInt(args[3]);
isExecutingTask = true;
for (let x = -r; x <= r; x++) {
for (let z = -r; z <= r; z++) {
if (Math.round(Math.sqrt(xx + z*z)) === r) await placeBlockSafe(cx + x, cy, cz + z, args[4]);
}
}
isExecutingTask = false;
sendMsg('✅ Xây hình tròn xong!');
} else if (text === 'sanquai') {
if (!arg) return sendMsg('⚠️ Dùng: *^sanquai [tên]^');
huntTargetType = arg.toLowerCase();
sendMsg(⚔️ Bật đi săn: ${huntTargetType});
} else if (text === 'dungsanquai') {
huntTargetType = null;
if (pathfinder) bot.pathfinder.setGoal(null);
sendMsg('🛑 Đã dừng đi săn.');
} else if (text === 'farm') {
if (args.length < 6) return sendMsg('⚠️ Dùng: *^farm x1 y1 z1 x2 y2 z2^');
farmCoords = {
minX: Math.min(args[0], args[3]), minY: Math.min(args[1], args[4]), minZ: Math.min(args[2], args[5]),
maxX: Math.max(args[0], args[3]), maxY: Math.max(args[1], args[4]), maxZ: Math.max(args[2], args[5])
};
isFarming = true;
sendMsg('♻️ Bật Auto Farm.');
} else if (text === 'dungfarm') {
isFarming = false;
sendMsg('🛑 Đã tắt Auto Farm.');
} else if (text === 'hotbar') {
const slot = parseInt(arg, 10);
if (slot >= 1 && slot <= 9) {
bot.setQuickBarSlot(slot - 1);
sendMsg(🎒 Đã đổi hotbar ô ${slot});
}
} else if (text === 'inv') {
const itemsList = [];
for (let i = 0; i < bot.inventory.slots.length; i++) {
const item = bot.inventory.slots[i];
if (item && item.name !== 'air') {
itemsList.push([Slot ${i}] ${item.name}x${item.count});
}
}
sendMsg(📦 Kho: ${itemsList.length > 0 ? itemsList.join(', ').substring(0, 220) : "Trống!"});
} else if (text === 'vutall') {
sendMsg('🗑️ Đang xả toàn bộ đồ trong túi...');
const items = bot.inventory.items();
for (let item of items) {
try { await bot.tossStack(item); await bot.waitForTicks(5); } catch (e) {}
}
sendMsg('✅ Đã dọn sạch đồ!');
} else if (text === 'vut') {
if (args.length >= 2) {
const amount = parseInt(args[0]);
const slotNum = parseInt(args[1]);
const itemToToss = bot.inventory.slots[slotNum];
if (itemToToss) {
try {
await bot.toss(itemToToss.type, itemToToss.metadata, amount);
sendMsg(🗑️ Đã vứt ${amount} cái từ slot ${slotNum}!);
} catch(e) {}
} else {
sendMsg(❌ Ô số ${slotNum} không có đồ!);
}
} else {
const item = bot.heldItem;
if (!item) return sendMsg('❌ Không cầm đồ trên tay!');
try { await bot.tossStack(item); sendMsg(🗑️ Đã vứt ${item.name}!); } catch (e) {}
}
} else if (text === 'click') {
if (!arg) return sendMsg('⚠️ Dùng: *^click [slot]^');
const slot = parseInt(arg, 10);
if (bot.currentWindow) {
await bot.clickWindow(slot, 0, 0).catch(()=>{});
sendMsg(🖱️ Đã click ô ${slot}!);
} else sendMsg('❌ Không mở rương!');
} else if (text === 'dongruong') {
if (bot.currentWindow) {
bot.closeWindow(bot.currentWindow);
sendMsg('🚪 Đã đóng rương!');
} else sendMsg('❌ Không mở rương!');
} else if (text === 'chuotphai') {
bot.activateItem();
sendMsg('🤚 Đã bấm chuột phải.');
} else if (text === 'an' || text === 'eat') {
autoEat();
sendMsg('🍎 Đang tiến hành ăn hồi máu...');
}
}
​bot.on('physicsTick', async () => {
if (!bot.entity) return;
​if (customAttackTarget && remainingHits > 0) {
bot.attack(customAttackTarget, true);
remainingHits--;
if (remainingHits <= 0) {
customAttackTarget = null;
}
await bot.waitForTicks(10);
}
​if (bot.health < 20 && !isEating) {
autoEat();
}
​if (bot.health <= 5) {
bot.setControlState('forward', true);
bot.setControlState('sprint', true);
bot.setControlState('jump', true);
const threat = bot.nearestEntity(e => e.type === 'mob' || e.type === 'player');
if (threat) {
const yaw = Math.atan2(bot.entity.position.x - threat.position.x, bot.entity.position.z - threat.position.z);
bot.look(yaw, 0);
}
}
​if (lookTargetName !== null) {
const targetEntity = lookTargetName === 'nearest' ? bot.nearestEntity(e => e.type === 'player' && e !== bot.entity) : bot.players[lookTargetName]?.entity;
if (targetEntity) bot.lookAt(targetEntity.position.offset(0, 1.6, 0), true);
}
​if (followTargetName !== null && pathfinder) {
const targetEntity = followTargetName === 'nearest' ? bot.nearestEntity(e => e.type === 'player' && e !== bot.entity) : bot.players[followTargetName]?.entity;
if (targetEntity) bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2), true);
}
​if (huntTargetType && pathfinder && !isExecutingTask) {
const mob = bot.nearestEntity(e => e.type === 'mob' && e.name.toLowerCase().includes(huntTargetType));
if (mob) {
const dist = bot.entity.position.distanceTo(mob.position);
bot.pathfinder.setGoal(new goals.GoalFollow(mob, 2), true);
if (dist <= 3) bot.attack(mob, true);
}
}
​if (isFarming && farmCoords && !isExecutingTask) {
isExecutingTask = true;
let foundBlock = null;
​for(let y = farmCoords.maxY; y >= farmCoords.minY; y--) {
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
​if (foundBlock) {
try {
if (pathfinder) await bot.pathfinder.goto(new goals.GoalGetToBlock(foundBlock.position.x, foundBlock.position.y, foundBlock.position.z));
await bot.dig(foundBlock);
} catch (e) {}
}
isExecutingTask = false;
}
});
​bot.on('message', (jsonMsg) => {
const rawText = extractCleanChat(jsonMsg);
const fullText = rawText.replace(/\s+/g, ' ').trim();
if (!fullText) return;
const lowerMsg = fullText.toLowerCase();
​console.log([CHAT] 💬 ${fullText});
​if (fullText.includes('^')) {
const startIndex = fullText.indexOf('^');
const endIndex = fullText.indexOf('^', startIndex + 2);
​if (startIndex !== -1 && endIndex !== -1) {
const content = fullText.slice(startIndex + 2, endIndex).trim();
​let senderName = "Ai_do";
const pmMatch = fullText.match(/([a-zA-Z0-9_]+)\s*(?:➔|->)\stôi/i);
if (pmMatch) {
senderName = pmMatch[1];
} else {
const colonMatch = fullText.match(/([a-zA-Z0-9_]+)\s:/);
if (colonMatch) {
senderName = colonMatch[1];
} else {
const parts = fullText.split(/\s+/);
for (let p of parts) {
const cleanP = p.replace(/[^a-zA-Z0-9_]/g, '');
if (cleanP.length >= 3 && cleanP.toLowerCase() !== 'chat') {
senderName = cleanP;
break;
}
}
}
}
​console.log([IN-GAME COMMAND] 📩 Nhận từ ${senderName}: ${content});
​const validCommands = ['help', 'info', 'shards', 'players', 'w', 's', 'a', 'd', 'nhay', 'ngoi', 'unngoi', 'dung', 'ditheo', 'dungditheo', 'nhintheo', 'dungnhin', 'tpa', 'tpaccept', 'tpacc', 'afkzone', 'afk', 'danh', 'dungdanh', 'daoblock', 'daotoado', 'daovung', 'xayvung', 'xaytron', 'sanquai', 'dungsanquai', 'farm', 'dungfarm', 'hotbar', 'inv', 'vut', 'vutall', 'vut1', 'click', 'dongruong', 'chuotphai', 'an', 'eat'];
​const cmdKey = content.split(' ')[0].toLowerCase();
​if (validCommands.includes(cmdKey)) {
handleCommand(content, senderName);
} else {
bot.chat(content);
console.log([BOT TALK] 🗣️ Đã nói: ${content});
}
}
}
​const shardMatch = lowerMsg.match(/bạn đã nhận (\d+) shards từ afk/);
if (shardMatch) {
totalShards += parseInt(shardMatch[1], 10);
console.log([SHARD] 💎 Tích lũy tổng cộng: ${totalShards} Shards);
}
​if ((lowerMsg.includes('login') || lowerMsg.includes('mật khẩu')) && !isInitialized) {
bot.chat('/login long232012');
}
​if ((lowerMsg.includes('successfully logged') || lowerMsg.includes('đã đăng nhập trước đó') || lowerMsg.includes('đã đăng nhập')) && !isInitialized) {
isInitialized = true;
console.log('[SYSTEM] 🚀 Đăng nhập thành công, chuẩn bị sang Eco...');
setTimeout(() => bot.chat('/server eco'), 3000);
setTimeout(() => bot.chat('/afkzone'), 10000);
​const now = Date.now();
if (now - lastDailyTime >= DAILY_COOLDOWN) {
setTimeout(() => {
bot.chat('/daily');
lastDailyTime = Date.now();
}, 14000);
}
}
});
​const dailyInterval = setInterval(() => {
if (!isInitialized || !bot) return;
const now = Date.now();
if (now - lastDailyTime >= DAILY_COOLDOWN) {
bot.chat('/daily');
lastDailyTime = now;
}
}, 60000);
​bot.on('windowOpen', async (window) => {
const titleStr = JSON.stringify(window.title || '').toLowerCase();
console.log([CHEST] 📦 Đã mở GUI: ${titleStr});
​if (titleStr.includes('daily') || titleStr.includes('điểm danh') || titleStr.includes('thưởng')) {
setTimeout(async () => {
try {
for (let i = 0; i < window.slots.length; i++) {
const item = window.slots[i];
if (!item) continue;
​const itemName = (item.name || '').toLowerCase();
const itemData = JSON.stringify(item).toLowerCase();
​if (itemName.includes('pane') || itemName.includes('barrier') || itemName.includes('air')) continue;
if (itemData.includes('đã nhận') || itemData.includes('claimed') || itemData.includes('khoá')) continue;
​await bot.clickWindow(i, 0, 0);
break;
}
setTimeout(() => { try { bot.closeWindow(window); } catch(e){} }, 1000);
} catch (e) {}
}, 1500);
return;
}
​setTimeout(async () => {
try {
let clickedGreen = false;
for (let i = 0; i < window.slots.length; i++) {
const item = window.slots[i];
if (item && item.name && (item.name.includes('green_stained_glass_pane') || item.name.includes('lime'))) {
await bot.clickWindow(i, 0, 0);
clickedGreen = true;
console.log([TELEPORT] ✅ Đã tự động ấn vào ô kính xanh tại slot ${i});
break;
}
}
if (!clickedGreen) {
const items = window.slots.filter(i => i && i.name !== 'air' && !i.name.includes('pane'))
.map(i => ${i.name}x${i.count}).join(', ');
if (items) {
bot.chat(📦 Kho rương: ${items.substring(0, 220)});
}
}
} catch(e) {}
}, 1000);
});
​setInterval(() => {
if (bot.entity && lookTargetName === null) {
bot.look(bot.entity.yaw + (Math.random() * 0.5 - 0.25), bot.entity.pitch, true);
}
}, 30000);
​bot.on('spawn', () => {
setTimeout(() => { if (!isInitialized) bot.chat('/login long232012'); }, 5000);
});
​bot.on('end', () => {
clearInterval(dailyInterval);
console.log('[SERVER] ⚠️ Bị văng! Tự kết nối lại sau 20s...');
setTimeout(createBot, 20000);
});
}
​createBot();

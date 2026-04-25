const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const { Boom } = require('@hapi/boom');

// --- إعدادات قائمة المطورين (الناصري) ---
const DEVELOPERS = [
    '967739841457@s.whatsapp.net', 
    '967772382481@s.whatsapp.net'
]; 
const DEV_NAME = "عبد الناصر الشميري (الناصري)";
let warns = {}; 

// مصفوفة الشتائم الشاملة (تمت إضافة الكلمة المطلوبة)
const badWords = [
    'كلب', 'حمار', 'لعن', 'تفو', 'منيك', 'شرموط', 'قحبة', 'ديوث', 'كس', 'طيز', 
    'يا واد', 'يا منيوك', 'بغل', 'حيوان', 'واطي', 'سافل', 'حقير', 'تفه', 'انقلع', 
    'يا وسخ', 'يا نجس', 'يا لوطي', 'يا عاهرة', 'يا زانية', 'يا عار', 'يا فاشل', 
    'يا جزمة', 'يا صرصار', 'يا معفن', 'يا رمة', 'ابن الكلب', 'ابن الحرام',
    'امك', 'اختك', 'عرضك', 'خنيث', 'قواد', 'سرسري', 'هلفوت', 'كسمك', 'نيج',
    'تناج', 'منيكة', 'مصخرة', 'عرص', 'خول', 'شاذ', 'قذر', 'سكس'
];

const hadiths = [
    "قال ﷺ: «ليس المؤمن بالطعان ولا اللعان ولا الفاحش ولا البذيء»",
    "قال ﷺ: «من كان يؤمن بالله واليوم الآخر فليقل خيراً أو ليصمت»",
    "قال ﷺ: «المسلم من سلم المسلمون من لسانه ويده»",
    "قال ﷺ: «إن الرجل ليتكلم بالكلمة لا يرى بها بأساً يهوي بها في النار سبعين خريفاً»"
];

async function startAlNaseriBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const sender = msg.key.participant || msg.key.remoteJid;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const lowerBody = body.toLowerCase();

        if (!isGroup) return; 

        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants;
        const isAdmin = participants.find(p => p.id === sender)?.admin !== null;
        const isDeveloper = DEVELOPERS.includes(sender);

        // --- أوامر المطورين ---
        if (body === 'بوتي' && isDeveloper) {
            return await sock.sendMessage(jid, { text: `أهلاً بك يا مطوري العزيز ${DEV_NAME}. أوامرك مطاعة دائماً من أي رقم تستخدمه. 🫡🔥` });
        }

        if (body === 'المطور') {
            return await sock.sendMessage(jid, { text: `👤 *معلومات المطور*:\n\n✨ الأسم: ${DEV_NAME}\n📱 الرقم 1: +967 739 841 457\n📱 الرقم 2: +967 772 382 481\n\nيُرجى مخاطبة المطور بكل احترام وتقدير. 🌹` });
        }

        if (body === 'تصفية' && isDeveloper) {
            const toRemove = participants.map(p => p.id).filter(id => !DEVELOPERS.includes(id));
            await sock.sendMessage(jid, { text: "⚠️ جاري تصفية المجموعة بالكامل بأمر المطور... استعدوا! 🧹" });
            for (let id of toRemove) { 
                try { await sock.groupParticipantsUpdate(jid, [id], "remove"); } catch (e) { console.log(e); }
            }
            return;
        }

        if (body === '!اخرج' && isDeveloper) {
            await sock.sendMessage(jid, { text: "وداعاً، سأغادر المجموعة الآن بناءً على طلب مطوري. 👋" });
            return await sock.groupLeave(jid);
        }

        if (body === '!قفل' && isDeveloper) {
            await sock.groupSettingUpdate(jid, 'announcement');
            return await sock.sendMessage(jid, { text: "تم قفل المجموعة للمشرفين فقط بأمر المطور. 🔒" });
        }

        if (body === '!فتح' && isDeveloper) {
            await sock.groupSettingUpdate(jid, 'not_announcement');
            return await sock.sendMessage(jid, { text: "تم فتح المجموعة للجميع بأمر المطور. ✅" });
        }

        // --- نظام الحماية ---
        const isUrl = /(https?:\/\/[^\s]+)/g.test(lowerBody);
        const hasBadWord = badWords.some(word => lowerBody.includes(word));

        if (isUrl || hasBadWord) {
            if (isDeveloper) return; // حصانة للمطور

            await sock.sendMessage(jid, { delete: msg.key });

            if (isAdmin) {
                const randomHadith = hadiths[Math.floor(Math.random() * hadiths.length)];
                return await sock.sendMessage(jid, { text: `⚠️ عذراً أيها المشرف، تم حذف رسالتك لمخالفتها الآداب.\n\nتذكر قول نبينا ﷺ:\n"${randomHadith}"` });
            } else {
                if (!warns[sender]) warns[sender] = { links: 0, bad: 0 };
                if (isUrl) {
                    warns[sender].links++;
                    if (warns[sender].links >= 3) {
                        await sock.groupParticipantsUpdate(jid, [sender], "remove");
                        return await sock.sendMessage(jid, { text: "تم طرد العضو لإرسال الروابط (3/3) 🚫" });
                    }
                    return await sock.sendMessage(jid, { text: `⚠️ الروابط ممنوعة! إنذاراتك: ${warns[sender].links}/3` });
                }
                if (hasBadWord) {
                    warns[sender].bad++;
                    if (warns[sender].bad >= 7) {
                        await sock.groupParticipantsUpdate(jid, [sender], "remove");
                        return await sock.sendMessage(jid, { text: "تم طرد العضو بسبب كثرة السب (7/7) 🚷" });
                    }
                    return await sock.sendMessage(jid, { text: `⚠️ يرجى تحسين الأسلوب! إنذارات السب: ${warns[sender].bad}/7` });
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startAlNaseriBot();
        } else if (connection === 'open') {
            console.log('✅ البوت شغال الآن وجاهز يا ناصري!');
        }
    });
}

startAlNaseriBot();

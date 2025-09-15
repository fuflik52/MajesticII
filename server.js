const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const allRulesData = require('./rules_data');
const axios = require('axios');

const app = express();
const PORT = 5000;
const DATA_FILE = 'rules.json';
const USERS_FILE = 'users.json';
const REQUESTS_FILE = 'requests.json';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1383867565964525799/EmzMadL49Jrs3yMrTUJlH3DxGgS8IWYtjhKWJxTgqOwO8sKW4_pfPt5SRG6gfBkf0_J_';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Система отслеживания пользователей
let users = new Set();
let userSessions = new Map(); // sessionId -> { userId, lastSeen, userAgent }

// Система логирования запросов
let requests = [];

// Загружаем сохраненные запросы
function loadRequests() {
    try {
        if (fs.existsSync(REQUESTS_FILE)) {
            const data = fs.readFileSync(REQUESTS_FILE, 'utf8');
            requests = JSON.parse(data);
            console.log(`📝 Загружено ${requests.length} запросов из логов`);
        } else {
            requests = [];
            console.log('📝 Инициализирован пустой список запросов');
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки запросов:', error);
        requests = [];
    }
}

// Сохраняем запросы
function saveRequests() {
    try {
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2));
        console.log(`💾 Сохранено ${requests.length} запросов`);
    } catch (error) {
        console.error('❌ Ошибка сохранения запросов:', error);
    }
}

// Отправка в Discord
async function sendToDiscord(requestData) {
    try {
        const embed = {
            title: "🔍 Новый запрос к анализатору правил",
            color: 0x00d4ff,
            fields: [
                {
                    name: "👤 Пользователь",
                    value: `ID: ${requestData.userId || 'Неизвестно'}`,
                    inline: true
                },
                {
                    name: "❓ Вопрос",
                    value: requestData.question || 'Не указан',
                    inline: false
                },
                {
                    name: "📊 Результат",
                    value: `Найдено правил: ${requestData.rulesFound || 0}`,
                    inline: true
                },
                {
                    name: "⏱️ Время",
                    value: new Date(requestData.timestamp).toLocaleString('ru-RU'),
                    inline: true
                },
                {
                    name: "🌐 IP",
                    value: requestData.ip || 'Неизвестно',
                    inline: true
                }
            ],
            footer: {
                text: "Majestic RP - Анализатор правил"
            },
            timestamp: new Date().toISOString()
        };

        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [embed]
        });
        
        console.log('📤 Запрос отправлен в Discord');
    } catch (error) {
        console.error('❌ Ошибка отправки в Discord:', error);
    }
}

// Загружаем сохраненных пользователей (только в памяти на Vercel)
function loadUsers() {
    // На Vercel файловая система только для чтения, поэтому начинаем с пустого списка
    users = new Set();
    console.log(`👥 Инициализирован пустой список пользователей (Vercel режим)`);
}

// Сохраняем пользователей (только в памяти на Vercel)
function saveUsers() {
    // На Vercel файловая система только для чтения, поэтому сохраняем только в памяти
    console.log(`💾 Пользователи сохранены в памяти: ${users.size} уникальных пользователей`);
}

// Middleware для отслеживания пользователей
app.use((req, res, next) => {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    if (sessionId) {
        // Обновляем время последней активности
        if (userSessions.has(sessionId)) {
            const session = userSessions.get(sessionId);
            session.lastSeen = Date.now();
            session.userAgent = userAgent;
            // Не логируем каждый запрос, только при обновлении статистики
        } else {
            // Новый пользователь
            const userId = uuidv4();
            users.add(userId);
            userSessions.set(sessionId, {
                userId: userId,
                lastSeen: Date.now(),
                userAgent: userAgent
            });
            saveUsers();
            console.log(`👤 Новый пользователь #${users.size}: ${userId.substring(0, 8)}...`);
        }
    }
    
    next();
});


// Загружаем правила из файла
let rules = [];

function loadRules() {
    console.log('🔄 Начинаем загрузку правил...');
    console.log(`📁 Ищем файл: ${DATA_FILE}`);
    console.log(`📁 Текущая директория: ${process.cwd()}`);
    
    try {
        // Сначала пытаемся загрузить из файла
        if (fs.existsSync(DATA_FILE)) {
            console.log(`📄 Найден файл правил: ${DATA_FILE}`);
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            console.log(`📖 Прочитано данных: ${data.length} символов`);
            rules = JSON.parse(data);
            console.log(`📚 Успешно загружено ${rules.length} правил из ${DATA_FILE}`);
            
            // Если файл пустой или содержит пустой массив, загружаем полные правила
            if (!rules || rules.length === 0) {
                console.log(`⚠️ Файл ${DATA_FILE} пустой, загружаем полные правила`);
                loadFullRules();
            }
        } else {
            console.log(`⚠️ Файл ${DATA_FILE} не найден, загружаем полные правила`);
            loadFullRules();
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки правил:', error);
        console.error('❌ Детали ошибки:', error.message);
        console.log('🔄 Переходим к загрузке полных правил...');
        loadFullRules();
    }
}

function loadFullRules() {
    console.log('📥 Загружаем полные правила...');
    try {
        // Загружаем все правила напрямую из кода
        rules = getAllRules();
        console.log(`✅ Загружено ${rules.length} полных правил`);
        saveRules();
    } catch (error) {
        console.error('❌ Ошибка загрузки полных правил:', error);
        console.error('❌ Детали ошибки:', error.message);
        console.log('🏭 Создаем базовые правила как fallback');
        rules = createDefaultRules();
        saveRules();
    }
}

function loadDemoRules() {
    console.log('📥 Загружаем демонстрационные правила...');
    try {
        if (fs.existsSync('demo_rules.txt')) {
            console.log('📄 Найден файл demo_rules.txt');
            const demoData = fs.readFileSync('demo_rules.txt', { encoding: 'utf8' });
            console.log(`📖 Прочитано из demo_rules.txt: ${demoData.length} символов`);
            
            rules = parseDemoRules(demoData);
            console.log(`🔄 Парсинг завершен, получено ${rules.length} правил`);
            
            saveRules();
            console.log(`✅ Загружено и сохранено ${rules.length} демо-правил`);
        } else {
            console.log('⚠️ Файл demo_rules.txt не найден, создаем базовые правила');
            // Создаем базовые правила если нет файла
            rules = createDefaultRules();
            console.log(`🏭 Создано ${rules.length} базовых правил`);
            saveRules();
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки демо-правил:', error);
        console.error('❌ Детали ошибки:', error.message);
        console.log('🏭 Создаем базовые правила как fallback');
        rules = createDefaultRules();
        saveRules();
    }
}

// Функция для извлечения текста из HTML
function extractTextFromHTML(html) {
    // Удаляем HTML теги
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    text = text.replace(/<[^>]*>/g, '');
    
    // Декодируем HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    
    // Убираем лишние пробелы и переносы строк
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
}

function parseDemoRules(text) {
    console.log('🔍 Начинаем парсинг демо-правил...');
    
    // Проверяем, является ли это HTML
    if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<body')) {
        console.log('🌐 Обнаружен HTML контент, извлекаем текст...');
        text = extractTextFromHTML(text);
        console.log(`📖 Извлечено текста: ${text.length} символов`);
    }
    
    const lines = text.split('\n').filter(line => line.trim());
    console.log(`📝 Найдено строк для обработки: ${lines.length}`);
    const parsedRules = [];
    
    lines.forEach((line, index) => {
        console.log(`🔍 Обрабатываем строку ${index + 1}: "${line}" (длина: ${line.length})`);
        const match = line.match(/^(\d+)\.\s*(.+?)\s*\|\s*(.+)$/);
        if (match) {
            const ruleText = match[2].trim();
            const newRule = {
                id: uuidv4(),
                point: match[1],
                title: ruleText.substring(0, 50) + (ruleText.length > 50 ? '...' : ''),
                content: ruleText,
                punishment: match[3].trim(),
                category: 'Общие правила',
                created: new Date().toISOString()
            };
            parsedRules.push(newRule);
            console.log(`✅ Правило ${match[1]}: "${ruleText.substring(0, 30)}..."`);
        } else {
            console.log(`⚠️ Строка ${index + 1} не соответствует формату: "${line.substring(0, 100)}..."`);
            // Попробуем более простое регулярное выражение
            const simpleMatch = line.match(/^(\d+)\.\s*(.+)\s*\|\s*(.+)$/);
            if (simpleMatch) {
                console.log(`🔧 Простой регекс сработал! Создаем правило...`);
                const ruleText = simpleMatch[2].trim();
                const newRule = {
                    id: uuidv4(),
                    point: simpleMatch[1],
                    title: ruleText.substring(0, 50) + (ruleText.length > 50 ? '...' : ''),
                    content: ruleText,
                    punishment: simpleMatch[3].trim(),
                    category: 'Общие правила',
                    created: new Date().toISOString()
                };
                parsedRules.push(newRule);
                console.log(`✅ Правило ${simpleMatch[1]}: "${ruleText.substring(0, 30)}..."`);
            }
        }
    });
    
    console.log(`🎯 Парсинг завершен: ${parsedRules.length} правил успешно обработано`);
    return parsedRules;
}

function createDefaultRules() {
    return [
        {
            id: uuidv4(),
            point: '1',
            title: 'Сотрудники государственных организаций обязаны...',
            content: 'Сотрудники государственных организаций обязаны соблюдать служебную дисциплину',
            punishment: 'WARN',
            category: 'Общие правила',
            created: new Date().toISOString()
        },
        {
            id: uuidv4(),
            point: '2',
            title: 'Форма одежды должна соответствовать...',
            content: 'Форма одежды должна соответствовать установленным стандартам организации',
            punishment: 'Demorgan 35 минут',
            category: 'Внешний вид',
            created: new Date().toISOString()
        },
        {
            id: uuidv4(),
            point: '6',
            title: 'Изъятие нелегальных предметов...',
            content: 'Изъятие нелегальных предметов производится исключительно через функционал сервера',
            punishment: 'Demorgan 35 минут / WARN',
            category: 'Процедуры',
            created: new Date().toISOString()
        }
    ];
}

function getAllRules() {
    return allRulesData;
}

function saveRules() {
    // На Vercel файловая система только для чтения, поэтому сохраняем только в памяти
    console.log(`💾 Правила сохранены в памяти: ${rules.length} правил`);
}

// Поиск правил
function searchRules(query) {
    if (!query || query.trim() === '') {
        return rules.slice(0, 10); // Возвращаем первые 10 правил
    }
    
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
    const results = [];
    
    rules.forEach(rule => {
        let score = 0;
        const ruleText = (rule.content + ' ' + rule.punishment + ' ' + rule.category).toLowerCase();
        const queryLower = query.toLowerCase();
        
        // Проверяем точное совпадение фразы
        if (ruleText.includes(queryLower)) {
            score += 10;
        }
        
        // Проверяем совпадение ключевых слов
        searchTerms.forEach(term => {
            if (ruleText.includes(term)) {
                score += 1;
                
                // Бонус за точное совпадение в тексте правила
                if (rule.content.toLowerCase().includes(term)) {
                    score += 3;
                }
                
                // Дополнительный бонус за совпадение в начале слова
                const words = ruleText.split(/\s+/);
                words.forEach(word => {
                    if (word.startsWith(term)) {
                        score += 2;
                    }
                });
            }
        });
        
                // Специальные проверки для конкретных терминов
                if (queryLower.includes('фракционн') && ruleText.includes('фракционн')) {
                    score += 5;
                }
                if (queryLower.includes('склад') && ruleText.includes('склад')) {
                    score += 5;
                }
                if (queryLower.includes('изъят') && ruleText.includes('изъят')) {
                    score += 5;
                }
                if (queryLower.includes('ранг') && ruleText.includes('ранг')) {
                    score += 5;
                }
                if (queryLower.includes('повыш') && ruleText.includes('повыш')) {
                    score += 5;
                }
                
                // Специальные проверки для игровых зон
                if (queryLower.includes('зона') && ruleText.includes('зона')) {
                    score += 8;
                }
                if (queryLower.includes('green') && ruleText.includes('green')) {
                    score += 10;
                }
                if (queryLower.includes('red') && ruleText.includes('red')) {
                    score += 10;
                }
                if (queryLower.includes('grey') && ruleText.includes('grey')) {
                    score += 10;
                }
                if (queryLower.includes('виды') && ruleText.includes('виды')) {
                    score += 8;
                }
                if (queryLower.includes('карта') && ruleText.includes('карта')) {
                    score += 8;
                }
                if (queryLower.includes('территория') && ruleText.includes('территория')) {
                    score += 6;
                }
        
        if (score > 0) {
            results.push({
                ...rule,
                relevance: Math.min(100, Math.round((score / searchTerms.length) * 100))
            });
        }
    });
    
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
}

// API Routes

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница запросов
app.get('/zaprosi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'zaprosi.html'));
});

// Статус системы
app.get('/api/status', (req, res) => {
    console.log(`📊 Запрос статуса системы. Правил в памяти: ${rules.length}`);
    res.json({
        status: 'ready',
        message: 'Система готова к работе',
        rulesCount: rules.length,
        usersCount: users.size,
        activeSessions: userSessions.size,
        version: '2.0.0'
    });
});

// API для получения статистики пользователей
app.get('/api/users/stats', (req, res) => {
    const now = Date.now();
    const activeThreshold = 5 * 60 * 1000; // 5 минут
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    
    // Подсчитываем активных пользователей (были активны в последние 5 минут)
    let activeUsers = 0;
    let currentUserId = null;
    let userNumber = 0;
    
    // Находим номер текущего пользователя
    if (sessionId && userSessions.has(sessionId)) {
        const currentSession = userSessions.get(sessionId);
        currentUserId = currentSession.userId;
        
        // Подсчитываем номер пользователя (порядок регистрации)
        const usersArray = Array.from(users);
        userNumber = usersArray.indexOf(currentUserId) + 1;
    }
    
    // Подсчитываем активных пользователей
    for (const [sessionId, session] of userSessions) {
        if (now - session.lastSeen < activeThreshold) {
            activeUsers++;
        }
    }
    
    res.json({
        totalUsers: users.size,
        activeUsers: activeUsers,
        totalSessions: userSessions.size,
        currentUserId: currentUserId,
        userNumber: userNumber,
        timestamp: new Date().toISOString()
    });
});

// Поиск по правилам
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress || 'Unknown';
    
    if (!question || question.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Вопрос не может быть пустым'
        });
    }
    
    try {
        console.log(`❓ Получен вопрос: ${question}`);
        
        const startTime = Date.now();
        const relevantRules = searchRules(question);
        const processingTime = Date.now() - startTime;
        
        console.log(`✅ Найдено ${relevantRules.length} правил за ${processingTime}мс`);
        
        // Получаем ID пользователя
        let userId = 'Неизвестно';
        if (sessionId && userSessions.has(sessionId)) {
            userId = userSessions.get(sessionId).userId;
        }
        
        // Создаем запись о запросе
        const requestData = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            question: question,
            userId: userId,
            sessionId: sessionId,
            userAgent: userAgent,
            ip: ip,
            rulesFound: relevantRules.length,
            processingTime: processingTime,
            rules: relevantRules.map(rule => ({
                id: rule.id,
                point: rule.point,
                title: rule.title,
                category: rule.category
            }))
        };
        
        // Добавляем в лог
        requests.push(requestData);
        saveRequests();
        
        // Отправляем в Discord
        await sendToDiscord(requestData);
        
        res.json({
            success: true,
            question: question,
            rules: relevantRules,
            totalFound: relevantRules.length,
            processingTime: processingTime
        });
        
    } catch (error) {
        console.error('❌ Ошибка поиска:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Получить все правила
app.get('/api/rules', (req, res) => {
    const { category, search } = req.query;
    console.log(`📚 Запрос правил: category=${category}, search=${search}`);
    let filteredRules = rules;
    
    if (category && category !== 'all') {
        const beforeFilter = filteredRules.length;
        filteredRules = filteredRules.filter(rule => rule.category === category);
        console.log(`🏷️ Фильтр по категории '${category}': ${beforeFilter} → ${filteredRules.length} правил`);
    }
    
    if (search) {
        filteredRules = searchRules(search);
        console.log(`🔍 Поиск по запросу '${search}': найдено ${filteredRules.length} правил`);
    }
    
    console.log(`📤 Отправляем ${filteredRules.length} правил`);
    res.json({
        success: true,
        rules: filteredRules,
        total: filteredRules.length
    });
});


// Получить категории
app.get('/api/categories', (req, res) => {
    const categories = [...new Set(rules.map(rule => rule.category))];
    res.json({
        success: true,
        categories: categories
    });
});

// Получить все запросы
app.get('/api/zaprosi', (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    
    const limitedRequests = requests
        .slice(parseInt(offset), parseInt(offset) + parseInt(limit))
        .reverse(); // Показываем последние запросы первыми
    
    res.json({
        success: true,
        requests: limitedRequests,
        total: requests.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
    });
});

// Получить статистику запросов
app.get('/api/zaprosi/stats', (req, res) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const todayRequests = requests.filter(req => new Date(req.timestamp) >= today);
    const weekRequests = requests.filter(req => new Date(req.timestamp) >= weekAgo);
    
    // Топ категорий
    const categoryStats = {};
    requests.forEach(req => {
        req.rules.forEach(rule => {
            categoryStats[rule.category] = (categoryStats[rule.category] || 0) + 1;
        });
    });
    
    const topCategories = Object.entries(categoryStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([category, count]) => ({ category, count }));
    
    res.json({
        success: true,
        stats: {
            total: requests.length,
            today: todayRequests.length,
            week: weekRequests.length,
            topCategories: topCategories,
            averageProcessingTime: requests.length > 0 
                ? Math.round(requests.reduce((sum, req) => sum + req.processingTime, 0) / requests.length)
                : 0
        }
    });
});


// Инициализация
loadRules();
loadUsers();
loadRequests();

// Запуск сервера
app.listen(PORT, () => {
    console.log('🌐 Запуск веб-сервера анализатора правил Majestic RP (Node.js)');
    console.log('=' .repeat(60));
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📱 Откройте браузер и перейдите по адресу: http://localhost:${PORT}`);
    console.log(`📚 Загружено правил: ${rules.length}`);
    console.log('💡 Для остановки нажмите Ctrl+C');
    console.log('=' .repeat(60));
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Сервер остановлен пользователем');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Сервер остановлен');
    process.exit(0);
});

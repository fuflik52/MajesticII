const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 5000;
const DATA_FILE = 'rules.json';
const USERS_FILE = 'users.json';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Система отслеживания пользователей
let users = new Set();
let userSessions = new Map(); // sessionId -> { userId, lastSeen, userAgent }

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
    console.log(`📁 Содержимое директории:`, fs.readdirSync('.'));
    
    try {
        if (fs.existsSync(DATA_FILE)) {
            console.log(`📄 Найден файл правил: ${DATA_FILE}`);
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            console.log(`📖 Прочитано данных: ${data.length} символов`);
            rules = JSON.parse(data);
            console.log(`📚 Успешно загружено ${rules.length} правил из ${DATA_FILE}`);
            
            // Если файл пустой или содержит пустой массив, загружаем демо-правила
            if (!rules || rules.length === 0) {
                console.log(`⚠️ Файл ${DATA_FILE} пустой, загружаем демо-правила`);
                loadDemoRules();
            }
        } else {
            console.log(`⚠️ Файл ${DATA_FILE} не найден, загружаем демо-правила`);
            console.log(`📁 Доступные файлы:`, fs.readdirSync('.'));
            // Загружаем демо-правила если файла нет
            loadDemoRules();
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки правил:', error);
        console.error('❌ Детали ошибки:', error.message);
        console.log('🔄 Переходим к загрузке демо-правил...');
        loadDemoRules();
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
app.post('/api/ask', (req, res) => {
    const { question } = req.body;
    
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


// Инициализация
loadRules();
loadUsers();

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

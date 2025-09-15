// Глобальные переменные
let isLoading = false;
let autoUpdateInterval = null;
let userStatsInterval = null;
let sessionId = null;

// Генерация уникального ID сессии
function generateSessionId() {
    if (!sessionId) {
        // Сначала пытаемся загрузить существующий ID из localStorage
        const savedSessionId = localStorage.getItem('majestic_session_id');
        
        if (savedSessionId) {
            sessionId = savedSessionId;
            console.log('🔄 Восстановлен существующий session ID:', sessionId.substring(0, 20) + '...');
        } else {
            // Создаем новый ID только если его нет
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('majestic_session_id', sessionId);
            console.log('🆕 Создан новый session ID:', sessionId.substring(0, 20) + '...');
        }
    }
    console.log('🆔 Используем session ID:', sessionId.substring(0, 20) + '...');
    return sessionId;
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    generateSessionId();
    checkServerStatus();
    loadCategories();
    startAutoUpdate();
    startUserStatsUpdate();
});

// Проверка статуса сервера
async function checkServerStatus() {
    try {
        console.log('🔍 Проверяем статус сервера...');
        const response = await fetch('/api/status', {
            headers: {
                'X-Session-ID': generateSessionId()
            }
        });
        const data = await response.json();
        
        console.log('📊 Ответ сервера:', data);
        
        if (data.status === 'ready') {
            document.getElementById('status-text').textContent = 
                `Система готова | Загружено ${data.rulesCount} правил`;
            console.log(`✅ Сервер готов, загружено ${data.rulesCount} правил`);
        } else {
            document.getElementById('status-text').textContent = 'Система инициализируется...';
            console.log('⏳ Сервер инициализируется...');
        }
    } catch (error) {
        document.getElementById('status-text').textContent = 'Сервер недоступен';
        console.error('❌ Ошибка проверки статуса:', error);
    }
}

// Обновление статистики пользователей
async function updateUserStats() {
    try {
        console.log('👥 Обновляем статистику пользователей...');
        const response = await fetch('/api/users/stats', {
            headers: {
                'X-Session-ID': generateSessionId()
            }
        });
        const data = await response.json();
        
        console.log('👥 Статистика пользователей:', data);
        
        const userIdElement = document.getElementById('user-id');
        const userOnlineElement = document.getElementById('user-online');
        
        if (userIdElement && userOnlineElement) {
            // Отображаем ID пользователя
            if (data.userNumber > 0) {
                userIdElement.textContent = `#${data.userNumber}`;
                console.log(`👤 Ваш ID пользователя: #${data.userNumber}`);
            } else {
                userIdElement.textContent = '#0';
                console.log('👤 ID пользователя не определен');
            }
            
            // Отображаем количество онлайн пользователей
            userOnlineElement.textContent = `${data.activeUsers} онлайн`;
            console.log(`🟢 Активных пользователей: ${data.activeUsers}`);
            
            // Подсвечиваем зеленым если есть активные пользователи
            if (data.activeUsers > 0) {
                userOnlineElement.classList.add('user-counter-online');
            } else {
                userOnlineElement.classList.remove('user-counter-online');
            }
        }
    } catch (error) {
        console.error('❌ Ошибка обновления статистики пользователей:', error);
    }
}

// Запуск автоматического обновления статистики пользователей
function startUserStatsUpdate() {
    // Обновляем сразу
    updateUserStats();
    
    // Затем каждые 10 секунд
    userStatsInterval = setInterval(updateUserStats, 10000);
}

// Загрузка категорий
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('category-filter');
            // Очищаем существующие опции (кроме "Все категории")
            select.innerHTML = '<option value="all">Все категории</option>';
            
            data.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

// Установка вопроса в поле ввода
function setQuestion(question) {
    document.getElementById('question-input').value = question;
}

// Обработка нажатия Enter
function handleKeyPress(event) {
    if (event.key === 'Enter' && !isLoading) {
        searchRules();
    }
}

// Поиск правил
async function searchRules() {
    if (isLoading) return;

    const input = document.getElementById('question-input');
    const question = input.value.trim();
    
    if (!question) {
        showError('Пожалуйста, введите вопрос');
        return;
    }

    isLoading = true;
    updateSearchUI(true);

    try {
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': generateSessionId()
            },
            body: JSON.stringify({ question: question }),
        });

        const data = await response.json();

        if (data.success) {
            displayResults(data, question);
        } else {
            showError(data.error || 'Произошла ошибка при поиске');
        }
    } catch (error) {
        console.error('Ошибка поиска:', error);
        showError('Ошибка соединения с сервером');
    } finally {
        isLoading = false;
        updateSearchUI(false);
    }
}

// Обновление UI во время поиска
function updateSearchUI(searching) {
    const button = document.getElementById('search-btn');
    
    if (searching) {
        button.disabled = true;
        button.innerHTML = '<div class="spinner"></div> Поиск...';
    } else {
        button.disabled = false;
        button.innerHTML = '🔍 Найти ответ';
    }
}

// Отображение результатов
function displayResults(data, question) {
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    
    if (data.rules.length === 0) {
        resultsContent.innerHTML = `
            <div class="no-results">
                <span class="emoji">🤷‍♂️</span>
                <h3>Ничего не найдено</h3>
                <p>По запросу "${question}" не найдено подходящих правил.</p>
                <p>Попробуйте переформулировать вопрос или использовать другие ключевые слова.</p>
            </div>
        `;
    } else {
        let html = `
            <h3>🔍 Результаты поиска для: "${question}"</h3>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                Найдено ${data.totalFound} правил за ${data.processingTime}мс
            </p>
        `;
        
        data.rules.forEach(rule => {
            html += createRuleHTML(rule, true);
        });
        
        resultsContent.innerHTML = html;
    }
    
    resultsSection.classList.add('show');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Создание HTML для правила
function createRuleHTML(rule, showRelevance = false) {
    const relevanceHTML = showRelevance && rule.relevance ? 
        `<span class="rule-relevance">${rule.relevance}%</span>` : '';
    
    // Выделяем ключевые слова в тексте правила
    const highlightedContent = highlightKeywords(rule.content, getSearchKeywords());
    const highlightedTitle = highlightKeywords(rule.title, getSearchKeywords());
    
    return `
        <div class="rule-item">
            <div class="rule-header">
                <span class="rule-number">Пункт ${rule.point}</span>
                <span class="rule-category">${rule.category}</span>
                ${relevanceHTML}
            </div>
            
            <div class="rule-title-highlighted">
                <strong>${highlightedTitle}</strong>
            </div>
            
            <div class="rule-content">
                ${highlightedContent}
            </div>
            
            <div class="rule-punishment">
                <strong>⚖️ Наказание:</strong> ${rule.punishment}
            </div>
        </div>
    `;
}

// Получить ключевые слова из поискового запроса
function getSearchKeywords() {
    const query = document.getElementById('question-input').value.toLowerCase();
    return query.split(' ').filter(word => word.length > 2);
}

// Выделить ключевые слова в тексте
function highlightKeywords(text, keywords) {
    if (!keywords || keywords.length === 0) return text;
    
    let highlightedText = text;
    keywords.forEach(keyword => {
        const regex = new RegExp(`(${keyword})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    
    return highlightedText;
}

// Показать все правила
async function showAllRules() {
    try {
        const response = await fetch('/api/rules');
        const data = await response.json();
        
        if (data.success) {
            const resultsSection = document.getElementById('results-section');
            const resultsContent = document.getElementById('results-content');
            
            let html = `
                <h3>📋 Все правила (${data.total})</h3>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    Полный список правил государственных организаций
                </p>
            `;
            
            data.rules.forEach(rule => {
                html += createRuleHTML(rule);
            });
            
            resultsContent.innerHTML = html;
            resultsSection.classList.add('show');
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Ошибка загрузки правил:', error);
        showError('Ошибка загрузки правил');
    }
}

// Фильтрация по категории
async function filterByCategory() {
    const category = document.getElementById('category-filter').value;
    
    try {
        const url = category === 'all' ? '/api/rules' : `/api/rules?category=${encodeURIComponent(category)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            const resultsSection = document.getElementById('results-section');
            const resultsContent = document.getElementById('results-content');
            
            const categoryName = category === 'all' ? 'Все правила' : category;
            
            let html = `
                <h3>📂 ${categoryName} (${data.total})</h3>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    Правила в категории "${categoryName}"
                </p>
            `;
            
            if (data.rules.length === 0) {
                html += `
                    <div class="no-results">
                        <span class="emoji">📭</span>
                        <h3>Нет правил в этой категории</h3>
                        <p>В категории "${categoryName}" пока нет правил.</p>
                    </div>
                `;
            } else {
                data.rules.forEach(rule => {
                    html += createRuleHTML(rule);
                });
            }
            
            resultsContent.innerHTML = html;
            resultsSection.classList.add('show');
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Ошибка фильтрации:', error);
        showError('Ошибка фильтрации правил');
    }
}

// Автоматическое отслеживание обновлений
function startAutoUpdate() {
    // Проверяем обновления каждые 30 секунд
    autoUpdateInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/status');
        const data = await response.json();
        
            if (data.status === 'ready') {
                const currentRulesCount = parseInt(document.getElementById('status-text').textContent.match(/\d+/)?.[0] || '0');
                
                if (data.rulesCount > currentRulesCount) {
                    console.log(`🔄 Обнаружено обновление: ${data.rulesCount} правил (было ${currentRulesCount})`);
                    
                    // Обновляем статус
                    document.getElementById('status-text').textContent = 
                        `Система готова | Загружено ${data.rulesCount} правил`;
                    
                    // Обновляем категории
                    loadCategories();
                    
                    // Показываем уведомление об обновлении
                    showUpdateNotification(data.rulesCount - currentRulesCount);
                }
            }
        } catch (error) {
            console.error('Ошибка проверки обновлений:', error);
        }
    }, 30000); // 30 секунд
}

// Показать уведомление об обновлении
function showUpdateNotification(newRulesCount) {
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    
    resultsContent.innerHTML = `
        <div class="success">
            <h4>🔄 Обновление правил</h4>
            <p>Обнаружено ${newRulesCount} новых правил. Система автоматически обновлена.</p>
            <button class="btn btn-secondary" onclick="showAllRules()" style="margin-top: 10px;">
                📋 Показать все правила
            </button>
        </div>
    `;
    
    resultsSection.classList.add('show');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    // Скрываем уведомление через 5 секунд
    setTimeout(() => {
        resultsSection.classList.remove('show');
    }, 5000);
}


// Показать информацию о зонах
function showZonesInfo() {
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    
    resultsContent.innerHTML = `
        <div class="zones-info">
            <h3>🗺️ Информация об игровых зонах</h3>
            
            <div class="zone-info-card green-zone">
                <h4>🟢 Green Zone</h4>
                <p><strong>Описание:</strong> Густонаселенная гражданскими людьми территория, в которой запрещены любые криминальные действия.</p>
                <p><strong>Цвет на карте:</strong> Зелёный</p>
                <p><strong>Основные правила:</strong></p>
                <ul>
                    <li>Запрещены любые криминальные действия</li>
                    <li>Запрещены перестрелки и стрельба</li>
                    <li>Запрещены ограбления и похищения</li>
                    <li>Запрещено уходить от погони</li>
                    <li>Запрещено включать музыку</li>
                </ul>
            </div>
            
            <div class="zone-info-card red-zone">
                <h4>🔴 Red Zone</h4>
                <p><strong>Описание:</strong> Криминальные территории в Los Santos, в которых проживает большое количество преступного населения.</p>
                <p><strong>Цвет на карте:</strong> Красный</p>
                <p><strong>Основные правила:</strong></p>
                <ul>
                    <li>Разрешены любые преступные действия без масок</li>
                    <li>С 23:00 до 08:00 разрешена стрельба по вооружённым</li>
                    <li>С 23:00 до 08:00 разрешено нарушать правила PG</li>
                </ul>
            </div>
            
            <div class="zone-info-card grey-zone">
                <h4>⚪ Grey Zone</h4>
                <p><strong>Описание:</strong> Неокрашенная территория на карте является нейтральной.</p>
                <p><strong>Цвет на карте:</strong> Неокрашенная часть</p>
                <p><strong>Основные правила:</strong></p>
                <ul>
                    <li>Разрешены криминальные действия с учетом всех правил сервера</li>
                    <li>Стандартные правила сервера</li>
                </ul>
            </div>
            
            <button class="btn btn-primary" onclick="setQuestion('какие есть виды зон')" style="margin-top: 20px; width: 100%;">
                🔍 Найти все правила зон
            </button>
        </div>
    `;
    
    resultsSection.classList.add('show');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Показать ошибку
function showError(message) {
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    
    resultsContent.innerHTML = `
        <div class="error">
            <h4>❌ Ошибка</h4>
            <p>${message}</p>
        </div>
    `;
    
    resultsSection.classList.add('show');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Показать успешное сообщение
function showSuccess(message) {
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    
    resultsContent.innerHTML = `
        <div class="success">
            <h4>✅ Успешно</h4>
            <p>${message}</p>
        </div>
    `;
    
    resultsSection.classList.add('show');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    // Скрываем сообщение через 3 секунды
    setTimeout(() => {
        resultsSection.classList.remove('show');
    }, 3000);
}

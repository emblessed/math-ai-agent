import readline from "readline";
import { queryOllama } from "./ollamaClient.js";
import { create, all } from "mathjs";

const math = create(all);
const scope = {}; 

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("\x1b[36m=== Математический AI агент (Node.js + mathjs) ===\x1b[0m");
console.log("Инструкция:");
console.log("- Математика: \x1b[33msqrt(25)\x1b[0m, \x1b[33msin(45 deg)\x1b[0m, \x1b[33m'x' = 10\x1b[0m");
console.log("- Чат: \x1b[35mЛюбой текстовый вопрос\x1b[0m");
console.log("- Выход: 'exit'\n");

const MAX_HISTORY = 5;
const dialogueHistory = [];

// --- 1. Продвинутая транслитерация (не трогает латинские команды типа sin/sqrt) ---
function transliterate(text) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return text.split('').map(char => {
    if (/[a-zA-Z]/.test(char)) return char; // Оставляем английские буквы (команды)
    const lower = char.toLowerCase();
    if (map[lower] !== undefined) {
      return char === char.toUpperCase() ? map[lower].toUpperCase() : map[lower];
    }
    return char;
  }).join('');
}

// --- 2. Основной цикл ---
async function askPrompt() {
  rl.question("\x1b[37mВы:\x1b[0m ", async (userInput) => {
    if (userInput.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    // Авто-определение чата (двойные кавычки без мат. символов)
    const isExplicitChat = /"/.test(userInput) && !/[=\+\-\*\/\|^]/.test(userInput);

    if (!isExplicitChat) {
      try {
        const cleanedExpr = preprocessExpression(userInput);
        const expressions = splitExpressions(cleanedExpr);
        let currentEval;

        for (let expr of expressions) {
          currentEval = math.evaluate(expr, scope);
        }
        
        console.log(`\x1b[32mИИ Агент:\x1b[0m ${formatResult(currentEval)}\n`);
        return askPrompt(); 
        
      } catch (err) {
        // Если mathjs не справился, идем к LLM
      }
    }

    try {
      const response = await queryOllama(buildPrompt(userInput));
      console.log(`\x1b[32mИИ Агент:\x1b[0m ${response}\n`);
      
      dialogueHistory.push({ role: "User", text: userInput }, { role: "Assistant", text: response });
      if (dialogueHistory.length > MAX_HISTORY * 2) dialogueHistory.splice(0, 2);
    } catch (err) {
      console.log(`\x1b[31mОшибка связи:\x1b[0m ${err.message}\n`);
    }

    askPrompt();
  });
}

// --- 3. Вспомогательные функции ---
function preprocessExpression(expr) {
  let processed = expr
    .replace(/корень из/g, "sqrt")
    .replace(/степень/g, "^")
    .replace(/модуль/g, "abs")
    .replace(/равно|равна|есть/g, "=") 
    .replace(/градусов|град/g, "deg") 
    .replace(/'/g, "");

  return transliterate(processed).replace(/\*\*/g, "^").trim();
}

function splitExpressions(input) {
  const parts = [];
  let current = "";
  let bracketLevel = 0;
  for (let char of input) {
    if (char === "[") bracketLevel++;
    if (char === "]") bracketLevel--;
    if (char === ";" && bracketLevel === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(p => p.length > 0);
}

function formatResult(result) {
  if (result === undefined) return "Готово, сохранил.";
  if (result && typeof result === 'object' && result.value !== undefined) {
    return `Результат: ${result.toString()}`;
  }
  if (result && result._data) return `Матрица: ${JSON.stringify(result._data)}`; 
  if (typeof result === 'number') {
    return `Результат: ${Math.round(result * 1000) / 1000}`;
  }
  return `Результат: ${result}`;
}

// --- 4. Генерация динамического промпта ---
function buildPrompt(userMessage) {
  const vars = Object.keys(scope).filter(k => typeof scope[k] !== 'function');
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { 
    day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' 
  });
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  let prompt = `System: Ты — лаконичный ИИ-эксперт.
- СЕГОДНЯ: ${dateStr}, время: ${timeStr}.
- Твои ответы должны быть короткими и точными.
- ПРАВИЛО: Если пользователь спорит с твоим фактом, не будь упрямым. Признай вероятность ошибки и предложи посчитать на основе данных пользователя.
- Никогда не упоминай "базу знаний" или "дату обновления".
- Твой любимый фильм — "Интерстеллар".`;

  if (vars.length > 0) {
    prompt += `\nВ памяти сейчас: ${vars.join(", ")}.`;
  }
  
  prompt += `\n\nИстория диалога:\n`;
  dialogueHistory.slice(-6).forEach(msg => {
    prompt += `${msg.role}: ${msg.text}\n`;
  });
  
  prompt += `User: ${userMessage}\nAssistant:`;
  return prompt;
}

askPrompt();

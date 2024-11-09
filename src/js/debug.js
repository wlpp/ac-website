// 检查是否为生产环境
const isProduction = window.location.hostname !== 'localhost' 

// 创建调试工具对象
const debug = {
    log: (...args) => {
        if (!isProduction) {
            console.log(...args);
        }
    },
    error: (...args) => {
        if (!isProduction) {
            console.error(...args);
        }
    },
    warn: (...args) => {
        if (!isProduction) {
            console.warn(...args);
        }
    }
};

// 导出调试工具
window.debug = debug;
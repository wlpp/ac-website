class MessageBox {
    static show(message, type = 'info', duration = 3000) {
        // 检查是否已存在消息元素
        let messageEl = document.querySelector('.message-box');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = 'message-box';
            document.body.appendChild(messageEl);
        }
        // 设置消息样式和内容
        messageEl.textContent = message;
        messageEl.className = `message-box ${type}`;
        
        // 显示消息
        messageEl.style.display = 'block';
        
        // 指定时间后自动隐藏
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, duration);
    }
    
    static success(message, duration) {
        this.show(message, 'success', duration);
    }
    
    static error(message, duration) {
        this.show(message, 'error', duration);
    }
    
    static info(message, duration) {
        this.show(message, 'info', duration);
    }
}

// 导出 MessageBox
window.MessageBox = MessageBox; 
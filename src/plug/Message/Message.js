// 创建全局消息对象
const Message = (function() {
    class MessageClass {
        constructor() {
            // 创建容器
            this.container = document.createElement('div');
            this.container.className = 'message-container';
            document.body.appendChild(this.container);
        }

        show(options = {}) {
            const {
                type = 'info',
                message = '',
                duration = 3000,
                showClose = true
            } = options;

            const messageEl = document.createElement('div');
            messageEl.className = `message message-${type}`;
            
            const content = document.createElement('div');
            content.className = 'message-content';
            
            const icon = document.createElement('i');
            icon.className = `message-icon ${this.getIconClass(type)}`;
            content.appendChild(icon);
            
            const text = document.createElement('span');
            text.textContent = message;
            content.appendChild(text);
            
            messageEl.appendChild(content);

            if (showClose) {
                const closeBtn = document.createElement('div');
                closeBtn.className = 'message-close';
                closeBtn.innerHTML = '×';
                closeBtn.onclick = () => this.close(messageEl);
                messageEl.appendChild(closeBtn);
            }

            this.container.appendChild(messageEl);

            requestAnimationFrame(() => {
                messageEl.classList.add('message-show');
            });

            if (duration > 0) {
                setTimeout(() => {
                    this.close(messageEl);
                }, duration);
            }
        }

        close(messageEl) {
            messageEl.classList.remove('message-show');
            messageEl.classList.add('message-hide');
            
            messageEl.addEventListener('animationend', () => {
                messageEl.remove();
            });
        }

        getIconClass(type) {
            const icons = {
                info: 'info-circle',
                success: 'check-circle',
                warning: 'exclamation-circle',
                error: 'times-circle'
            };
            return icons[type] || icons.info;
        }

        info(message, duration) {
            this.show({ type: 'info', message, duration });
        }

        success(message, duration) {
            this.show({ type: 'success', message, duration });
        }

        warning(message, duration) {
            this.show({ type: 'warning', message, duration });
        }

        error(message, duration) {
            this.show({ type: 'error', message, duration });
        }
    }

    // 返回单例
    return new MessageClass();
})();

// 暴露到全局
window.message = Message;
// 模拟用户数据
const mockUsers = [
    {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        status: 1,
        createTime: '2024-03-20 10:00:00'
    }
];

// 添加筛选条件对象
let filters = {
    role: '',
    status: ''
};

let searchKeyword = '';

// 显示模态框
function showModal(title) {
    const modal = document.querySelector('.modal');
    const modalTitle = document.querySelector('.modal-header h3');
    
    if (modal && modalTitle) {
        modal.style.display = 'block';
        modalTitle.textContent = title;
        
        // 重置表单
        const form = document.querySelector('#userForm');
        if (form) {
            form.reset();
        }
    }
}

// 隐藏模态框
function hideModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 筛选用户
function filterUsers(type, value) {
    filters[type] = value;
    applyFilters();
}

// 应用所有筛选条件
function applyFilters() {
    let filteredUsers = mockUsers.filter(user => {
        let matchRole = !filters.role || user.role === filters.role;
        let matchStatus = filters.status === '' || user.status.toString() === filters.status;
        let matchSearch = !searchKeyword || 
            user.username.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            user.email.toLowerCase().includes(searchKeyword.toLowerCase());
        
        return matchRole && matchStatus && matchSearch;
    });
    
    renderUserList(filteredUsers);
}

// 搜索用户
function searchUsers(keyword) {
    searchKeyword = keyword;
    applyFilters();
}

// 渲染用户列表
function renderUserList(users) {
    const tbody = document.getElementById('userList');
    if (!tbody) {
        console.error('找不到userList元素');
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td><input type="checkbox" value="${user.id}"></td>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${formatRole(user.role)}</td>
            <td>
                <span class="status-badge ${user.status ? 'active' : 'inactive'}">
                    ${user.status ? '启用' : '禁用'}
                </span>
            </td>
            <td>${user.createTime}</td>
            <td>
                <button class="btn-icon" onclick="editUser(${user.id})" title="编辑">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteUser(${user.id})" title="删除">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// 编辑用户
function editUser(id) {
    const user = mockUsers.find(u => u.id === id);
    if (user) {
        showModal('编辑用户');
        const form = document.querySelector('#userForm');
        if (form) {
            form.username.value = user.username;
            form.email.value = user.email;
            form.role.value = user.role;
            form.status.value = user.status;
        }
    }
}

// 删除用户
function deleteUser(id) {
    if (confirm('确定要删除该用户吗？')) {
        const index = mockUsers.findIndex(u => u.id === id);
        if (index > -1) {
            mockUsers.splice(index, 1);
            renderUserList(mockUsers);
        }
    }
}

// 处理表单提交
function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const userData = {
        username: form.username.value,
        email: form.email.value,
        role: form.role.value,
        status: parseInt(form.status.value),
        createTime: new Date().toLocaleString()
    };

    // 如果是新用户，添加ID
    if (!form.dataset.userId) {
        userData.id = mockUsers.length + 1;
        mockUsers.push(userData);
    } else {
        // 更新现有用户
        const index = mockUsers.findIndex(u => u.id === parseInt(form.dataset.userId));
        if (index > -1) {
            mockUsers[index] = { ...mockUsers[index], ...userData };
        }
    }

    hideModal();
    renderUserList(mockUsers);
}

// 格式化角色
function formatRole(role) {
    const roles = {
        admin: '管理员',
        user: '用户'
    };
    return roles[role] || role;
}

// 页面初始化函数
function initPage() {
    // 渲染初始用户列表
    renderUserList(mockUsers);

    // 绑定添加用户按钮
    const addUserBtn = document.querySelector('.btn-primary');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => showModal('添加用户'));
    }

    // 绑定关闭按钮
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', hideModal);
    });

    // 绑定表单提交
    const userForm = document.querySelector('#userForm');
    if (userForm) {
        userForm.addEventListener('submit', handleSubmit);
    }

    // 绑定模态框外部点击关闭
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal();
        });
    }
}

// 导出初始化函数
window.initPage = initPage; 
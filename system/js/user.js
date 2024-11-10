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

// 修改搜索函数
let searchKeyword = '';
function searchUsers(keyword) {
    searchKeyword = keyword;
    applyFilters();
}

// 初始化函数
function initPage() {
    console.log('初始化用户页面');
    renderUserList(mockUsers);
}

// 渲染用户列表
function renderUserList(users) {
    console.log('渲染用户列表:', users);  // 添加调试日志
    const tbody = document.getElementById('userList');
    if (!tbody) {
        console.error('找不到userList元素');  // 添加调试日志
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>
                <input type="checkbox" value="${user.id}">
            </td>
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

// 显示添加用户弹窗
function showAddUserModal() {
    document.getElementById('modalTitle').textContent = '添加用户';
    document.getElementById('userForm').reset();
    document.getElementById('userModal').style.display = 'block';
}

// 显示编辑用户弹窗
function editUser(id) {
    const user = mockUsers.find(u => u.id === id);
    if (user) {
        document.getElementById('modalTitle').textContent = '编辑用户';
        const form = document.getElementById('userForm');
        form.username.value = user.username;
        form.email.value = user.email;
        form.role.value = user.role;
        form.status.value = user.status;
        document.getElementById('userModal').style.display = 'block';
    }
}

// 关闭用户弹窗
function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
}

// 保存用户
function saveUser() {
    const form = document.getElementById('userForm');
    const userData = {
        username: form.username.value,
        email: form.email.value,
        password: form.password.value,
        role: form.role.value,
        status: parseInt(form.status.value)
    };

    // 这里应该调用后端API保存数据
    console.log('保存用户数据:', userData);
    
    closeUserModal();
    // 刷新用户列表
    renderUserList(mockUsers);
}

// 删除用户
function deleteUser(id) {
    if (confirm('确定要删除该用户吗？')) {
        // 这里应该调用后端API删除数据
        mockUsers = mockUsers.filter(u => u.id !== id);
        renderUserList(mockUsers);
    }
}

// 格式化角色
function formatRole(role) {
    switch (role) {
        case 'admin':
            return '管理员';
        case 'user':
            return '用户';
        default:
            return role;
    }
}
// 用户列表数据
let users = [];

// 初始化用户列表
function initUserList() {
    // 模拟数据，实际项目中应该从后端获取
    users = [
        {
            id: 1,
            username: 'admin',
            email: 'admin@example.com',
            role: 'admin',
            status: 1,
            createTime: '2024-01-01 12:00:00'
        }
    ];
    renderUserList();
}

// 渲染用户列表
function renderUserList() {
    const tbody = document.getElementById('userList');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>
                <span class="status-badge ${user.status ? 'active' : 'inactive'}">
                    ${user.status ? '启用' : '禁用'}
                </span>
            </td>
            <td>${user.createTime}</td>
            <td>
                <button class="btn-icon" onclick="editUser(${user.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteUser(${user.id})">
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
    const user = users.find(u => u.id === id);
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
    initUserList();
}

// 删除用户
function deleteUser(id) {
    if (confirm('确定要删除该用户吗？')) {
        // 这里应该调用后端API删除数据
        users = users.filter(u => u.id !== id);
        renderUserList();
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initUserList); 
document.addEventListener('DOMContentLoaded', () => {
    // ---- Auth Logic ----
    const loginScreen = document.getElementById('loginScreen');
    const adminApp = document.getElementById('adminApp');
    const loginInput = document.getElementById('loginInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const currentUserName = document.getElementById('currentUserName');
    const passwordsBtnSidebar = document.getElementById('passwordsBtnSidebar');
    const passwordsModal = document.getElementById('passwordsModal');
    
    function getAdminUsers() {
        return JSON.parse(localStorage.getItem('elata_admin_users_v2')) || [];
    }
    function saveAdminUsers(users) {
        localStorage.setItem('elata_admin_users_v2', JSON.stringify(users));
    }

    function checkAuth() {
        const user = sessionStorage.getItem('elata_logged_in_user');
        if (user) {
            loginScreen.style.display = 'none';
            adminApp.style.display = 'flex';
            currentUserName.textContent = user;
            if (user === 'Admin') {
                passwordsBtnSidebar.style.display = 'flex';
            } else {
                passwordsBtnSidebar.style.display = 'none';
            }
        } else {
            loginScreen.style.display = 'flex';
            adminApp.style.display = 'none';
        }
    }

    loginBtn.addEventListener('click', () => {
        const login = loginInput.value.trim();
        const pass = passwordInput.value.trim();
        
        if (login === 'Admin' && pass === 'Elata00Aparts00') {
            sessionStorage.setItem('elata_logged_in_user', 'Admin');
            checkAuth();
            loginInput.value = '';
            passwordInput.value = '';
            return;
        }

        const users = getAdminUsers();
        const found = users.find(u => u.login === login && u.password === pass);
        if (found) {
            sessionStorage.setItem('elata_logged_in_user', login);
            checkAuth();
            loginInput.value = '';
            passwordInput.value = '';
        } else {
            alert('Невірний логін або пароль!');
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('elata_logged_in_user');
        checkAuth();
    });

    checkAuth(); // Initial check

    // ---- Passwords Modal Logic ----
    const closePasswordsModal = document.getElementById('closePasswordsModal');
    const usersList = document.getElementById('usersList');
    const newLogin = document.getElementById('newLogin');
    const newPassword = document.getElementById('newPassword');
    const addUserBtn = document.getElementById('addUserBtn');

    function renderUsersList() {
        if (!usersList) return;
        usersList.innerHTML = '';
        const users = getAdminUsers();
        users.forEach((u, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.login}</td>
                <td>${u.password}</td>
                <td>
                    <button class="btn-outline btn-sm delete-user-btn" data-index="${index}" style="color: red; border-color: red; padding: 0.2rem 0.5rem;">Видалити</button>
                </td>
            `;
            usersList.appendChild(tr);
        });

        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if(confirm('Видалити цього користувача?')) {
                    const idx = parseInt(e.target.getAttribute('data-index'));
                    let users = getAdminUsers();
                    users = users.filter((_, i) => i !== idx);
                    saveAdminUsers(users);
                    renderUsersList();
                }
            });
        });
    }

    if (passwordsBtnSidebar) {
        passwordsBtnSidebar.addEventListener('click', (e) => {
            e.preventDefault();
            renderUsersList();
            passwordsModal.classList.add('active');
        });
    }

    if (closePasswordsModal) {
        closePasswordsModal.addEventListener('click', () => {
            passwordsModal.classList.remove('active');
        });
    }

    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            const l = newLogin.value.trim();
            const p = newPassword.value.trim();
            if(!l || !p) return alert('Введіть логін і пароль');
            if(l === 'Admin') return alert('Логін Admin зарезервовано');
            
            const users = getAdminUsers();
            if(users.some(u => u.login === l)) return alert('Користувач з таким логіном вже існує');
            
            users.push({ login: l, password: p });
            saveAdminUsers(users);
            renderUsersList();
            newLogin.value = '';
            newPassword.value = '';
        });
    }

    // ---- Secure Cloud Database Integration (JSONBin-zeta) ----
    const DB_URL = 'https://jsonbin-zeta.vercel.app/api/bins/LaH3DFwkrP';
    let dbData = { bookings: [], blocked_dates: [] };
    let bookings = [];

    // Load from Cloud Database
    async function loadDbData() {
        try {
            const res = await fetch(DB_URL);
            if (res.ok) {
                const json = await res.json();
                if (json && json.data) {
                    dbData = json.data;
                    bookings = dbData.bookings || [];
                }
            }
        } catch (e) {
            console.error("Failed to load cloud database inside admin app", e);
        }
    }

    // Save back to Cloud Database
    async function saveDbData() {
        try {
            dbData.bookings = bookings;
            const res = await fetch(DB_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dbData)
            });
            return res.ok;
        } catch (e) {
            console.error("Failed to save cloud database inside admin app", e);
            return false;
        }
    }

    const tableBody = document.getElementById('bookingsTableBody');
    const statNew = document.getElementById('statNew');
    const statConfirmed = document.getElementById('statConfirmed');
    const statTotal = document.getElementById('statTotal');

    const modal = document.getElementById('editModal');
    let currentEditId = null;

    function renderTable() {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        let countNew = 0;
        let countConfirmed = 0;

        bookings.forEach(b => {
            if (b.status === 'Нове') countNew++;
            if (b.status === 'Підтверджено') countConfirmed++;

            const statusClass = b.status === 'Нове' ? 'status-new' :
                                b.status === 'Підтверджено' ? 'status-confirmed' : 'status-rejected';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${b.id}</td>
                <td><strong>${b.name}</strong></td>
                <td>${b.phone}</td>
                <td>${b.room}</td>
                <td>${b.dates}</td>
                <td><span class="status-badge ${statusClass}">${b.status}</span></td>
                <td>
                    <button class="btn-outline btn-sm edit-btn" data-id="${b.id}">Деталі</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Update stats
        if (statNew) statNew.textContent = countNew;
        if (statConfirmed) statConfirmed.textContent = countConfirmed;
        if (statTotal) statTotal.textContent = bookings.length;

        // Attach event listeners to buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                openModal(id);
            });
        });
    }

    function openModal(id) {
        const b = bookings.find(item => item && item.id && item.id.toString() === id.toString());
        if (!b) return;

        currentEditId = id;
        document.getElementById('modalId').textContent = b.id;
        document.getElementById('modalName').value = b.name;
        document.getElementById('modalPhone').value = b.phone;
        document.getElementById('modalRoom').value = b.room;
        document.getElementById('modalComment').value = b.comment;
        document.getElementById('modalStatus').value = b.status;

        modal.classList.add('active');
    }

    function closeModal() {
        modal.classList.remove('active');
        currentEditId = null;
    }

    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelModal').addEventListener('click', closeModal);

    document.getElementById('saveModal').addEventListener('click', async () => {
        if (!currentEditId) return;

        const newStatus = document.getElementById('modalStatus').value;
        const bIndex = bookings.findIndex(item => item.id === currentEditId);
        
        if (bIndex > -1) {
            const oldStatus = bookings[bIndex].status;
            bookings[bIndex].status = newStatus;
            
            // Handle automatic date blocking
            if (newStatus === 'Підтверджено' && oldStatus !== 'Підтверджено') {
                const datesStr = bookings[bIndex].dates;
                if (datesStr) {
                    const roomName = bookings[bIndex].room ? bookings[bIndex].room.split(' (')[0] : 'Усі номери';
                    const parts = datesStr.split(' - ');
                    if (parts.length === 2) {
                        const startParts = parts[0].split('.');
                        const endParts = parts[1].split('.');
                        const startFormatted = `${startParts[2]}-${startParts[1]}-${startParts[0]}`;
                        const endFormatted = `${endParts[2]}-${endParts[1]}-${endParts[0]}`;
                        
                        const ranges = getBlockedDates();
                        const isDuplicate = ranges.some(r => r.start === startFormatted && r.end === endFormatted && (r.room === roomName || r.room === 'Усі номери'));
                        if (!isDuplicate) {
                            ranges.push({ start: startFormatted, end: endFormatted, room: roomName });
                            saveBlockedDates(ranges);
                            if (typeof renderBlockedDates === 'function') renderBlockedDates();
                        }
                    }
                }
            } else if (newStatus === 'Відхилено' || (oldStatus === 'Підтверджено' && newStatus !== 'Підтверджено')) {
                // If they undo the confirmation
                const datesStr = bookings[bIndex].dates;
                if (datesStr) {
                    const roomName = bookings[bIndex].room ? bookings[bIndex].room.split(' (')[0] : 'Усі номери';
                    const parts = datesStr.split(' - ');
                    if (parts.length === 2) {
                        const startParts = parts[0].split('.');
                        const endParts = parts[1].split('.');
                        const startFormatted = `${startParts[2]}-${startParts[1]}-${startParts[0]}`;
                        const endFormatted = `${endParts[2]}-${endParts[1]}-${endParts[0]}`;
                        
                        let ranges = getBlockedDates();
                        ranges = ranges.filter(r => !(r.start === startFormatted && r.end === endFormatted && r.room === roomName));
                        saveBlockedDates(ranges);
                        if (typeof renderBlockedDates === 'function') renderBlockedDates();
                    }
                }
            }

            // Save to cloud and render
            const saveBtn = document.getElementById('saveModal');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Зберігаємо...';
            saveBtn.disabled = true;

            const success = await saveDbData();
            
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;

            if (success) {
                renderTable();
                closeModal();
            } else {
                alert('Не вдалося зберегти зміни на сервері. Будь ласка, спробуйте пізніше.');
            }
        }
    });

    document.getElementById('refreshBtn').addEventListener('click', async () => {
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.style.opacity = '0.5';
        await loadDbData();
        renderTable();
        refreshBtn.style.opacity = '1';
    });

    // Delete Booking Logic
    document.getElementById('deleteBookingBtn').addEventListener('click', async () => {
        if (!currentEditId) return;
        if (confirm('Ви впевнені, що хочете видалити цю заявку?')) {
            const bookingToDelete = bookings.find(item => item.id === currentEditId);
            
            // If the booking is deleted, unblock its dates!
            if (bookingToDelete && bookingToDelete.dates) {
                const datesStr = bookingToDelete.dates;
                const roomName = bookingToDelete.room ? bookingToDelete.room.split(' (')[0] : 'Усі номери';
                const parts = datesStr.split(' - ');
                if (parts.length === 2) {
                    const startParts = parts[0].split('.');
                    const endParts = parts[1].split('.');
                    const startFormatted = `${startParts[2]}-${startParts[1]}-${startParts[0]}`;
                    const endFormatted = `${endParts[2]}-${endParts[1]}-${endParts[0]}`;
                    
                    let ranges = getBlockedDates();
                    ranges = ranges.filter(r => !(r.start === startFormatted && r.end === endFormatted && r.room === roomName));
                    saveBlockedDates(ranges);
                    if (typeof renderBlockedDates === 'function') renderBlockedDates();
                }
            }

            bookings = bookings.filter(item => item.id !== currentEditId);
            
            const delBtn = document.getElementById('deleteBookingBtn');
            const originalText = delBtn.textContent;
            delBtn.textContent = 'Видаляємо...';
            delBtn.disabled = true;

            const success = await saveDbData();

            delBtn.textContent = originalText;
            delBtn.disabled = false;

            if (success) {
                renderTable();
                closeModal();
            } else {
                alert('Не вдалося видалити заявку з сервера. Спробуйте пізніше.');
            }
        }
    });

    // Blocked Dates Logic
    const datesModal = document.getElementById('datesModal');
    const manageDatesBtnSidebar = document.getElementById('manageDatesBtnSidebar');
    const closeDatesModalBtn = document.getElementById('closeDatesModal');
    const blockStartDate = document.getElementById('blockStartDate');
    const blockEndDate = document.getElementById('blockEndDate');
    const addBlockDateBtn = document.getElementById('addBlockDateBtn');
    const blockedDatesList = document.getElementById('blockedDatesList');

    // Set minimum date to today
    if (blockStartDate && blockEndDate) {
        const today = new Date().toISOString().split('T')[0];
        blockStartDate.setAttribute('min', today);
        blockEndDate.setAttribute('min', today);
        
        // Make sure end date cannot be earlier than start date
        blockStartDate.addEventListener('change', (e) => {
            blockEndDate.setAttribute('min', e.target.value);
        });
    }

    function getBlockedDates() {
        return dbData.blocked_dates || [];
    }

    function saveBlockedDates(dates) {
        dbData.blocked_dates = dates;
    }

    function renderBlockedDates() {
        if (!blockedDatesList) return;
        blockedDatesList.innerHTML = '';
        const ranges = getBlockedDates();
        
        // Sort by start date
        ranges.sort((a, b) => new Date(a.start) - new Date(b.start));

        ranges.forEach((range, index) => {
            const tr = document.createElement('tr');
            
            const tdRoom = document.createElement('td');
            tdRoom.textContent = range.room || 'Усі номери';
            
            const tdStart = document.createElement('td');
            tdStart.textContent = range.start;
            
            const tdEnd = document.createElement('td');
            tdEnd.textContent = range.end;
            
            const tdActions = document.createElement('td');
            const btn = document.createElement('button');
            btn.textContent = 'Відкрити';
            btn.className = 'btn-outline btn-sm';
            btn.style.padding = '0.2rem 0.5rem';
            btn.onclick = async () => {
                const newRanges = getBlockedDates().filter((_, i) => i !== index);
                saveBlockedDates(newRanges);
                
                btn.textContent = 'Відкриваємо...';
                btn.disabled = true;

                const success = await saveDbData();
                if (success) {
                    renderBlockedDates();
                } else {
                    alert('Не вдалося відкрити дати на сервері.');
                    btn.textContent = 'Відкрити';
                    btn.disabled = false;
                }
            };
            tdActions.appendChild(btn);
            
            tr.appendChild(tdRoom);
            tr.appendChild(tdStart);
            tr.appendChild(tdEnd);
            tr.appendChild(tdActions);
            blockedDatesList.appendChild(tr);
        });
    }

    if (manageDatesBtnSidebar) {
        manageDatesBtnSidebar.addEventListener('click', (e) => {
            e.preventDefault();
            renderBlockedDates();
            datesModal.classList.add('active');
        });
    }

    if (closeDatesModalBtn) {
        closeDatesModalBtn.addEventListener('click', () => {
            datesModal.classList.remove('active');
        });
    }

    if (addBlockDateBtn) {
        addBlockDateBtn.addEventListener('click', async () => {
            const startVal = blockStartDate.value;
            const endVal = blockEndDate.value;
            const roomVal = document.getElementById('blockRoomSelect').value;
            
            if (!startVal || !endVal) {
                alert('Будь ласка, введіть обидві дати.');
                return;
            }
            
            if (new Date(startVal) > new Date(endVal)) {
                alert('Дата початку не може бути пізніше дати кінця.');
                return;
            }

            const ranges = getBlockedDates();
            const isDuplicate = ranges.some(r => r.start === startVal && r.end === endVal && r.room === roomVal);
            
            if (!isDuplicate) {
                ranges.push({ start: startVal, end: endVal, room: roomVal });
                saveBlockedDates(ranges);
                
                addBlockDateBtn.textContent = 'Блокуємо...';
                addBlockDateBtn.disabled = true;

                const success = await saveDbData();
                
                addBlockDateBtn.textContent = 'Заблокувати період';
                addBlockDateBtn.disabled = false;

                if (success) {
                    blockStartDate.value = '';
                    blockEndDate.value = '';
                    renderBlockedDates();
                } else {
                    alert('Не вдалося заблокувати дати на сервері.');
                }
            } else {
                alert('Цей період вже закритий для вибраного номера.');
            }
        });
    }

    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
        if (e.target === datesModal) {
            datesModal.classList.remove('active');
        }
        if (e.target === passwordsModal) {
            passwordsModal.classList.remove('active');
        }
    });

    // Auto Refresh every 10 seconds from cloud database
    setInterval(async () => {
        // Only refresh if modal is not currently active to prevent editing interference
        if (!modal.classList.contains('active') && !datesModal.classList.contains('active') && !passwordsModal.classList.contains('active')) {
            await loadDbData();
            renderTable();
        }
    }, 10000);

    // Initial cloud load and render
    loadDbData().then(() => {
        renderTable();
    });
});
});

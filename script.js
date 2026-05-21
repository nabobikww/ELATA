document.addEventListener('DOMContentLoaded', () => {
    // ---- Cloud Database Hybrid Sync ----
    async function syncWithCloud() {
        try {
            const res = await fetch('/api/data');
            if (!res.ok) throw new Error('API error');
            const cloudData = await res.json();
            
            let localBookings = JSON.parse(localStorage.getItem('elata_bookings_v2')) || [];
            let localBlocked = JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || [];
            
            let cloudBookings = cloudData.bookings || [];
            let cloudBlocked = cloudData.blocked_dates || [];
            
            // Merge bookings by unique ID
            const bookingMap = new Map();
            cloudBookings.forEach(b => {
                if (b && b.id) bookingMap.set(b.id.toString(), b);
            });
            localBookings.forEach(b => {
                if (b && b.id) bookingMap.set(b.id.toString(), b);
            });
            const mergedBookings = Array.from(bookingMap.values());
            
            // Merge blocked dates by unique start_end_room
            const blockedMap = new Map();
            cloudBlocked.forEach(r => {
                if (r && r.start && r.end) {
                    const key = `${r.start}_${r.end}_${r.room || 'Усі номери'}`;
                    blockedMap.set(key, r);
                }
            });
            localBlocked.forEach(r => {
                if (r && r.start && r.end) {
                    const key = `${r.start}_${r.end}_${r.room || 'Усі номери'}`;
                    blockedMap.set(key, r);
                }
            });
            const mergedBlocked = Array.from(blockedMap.values());
            
            // Update localStorage
            localStorage.setItem('elata_bookings_v2', JSON.stringify(mergedBookings));
            localStorage.setItem('elata_blocked_dates_v2', JSON.stringify(mergedBlocked));
            
            // If merged arrays are larger than cloud arrays, sync back to cloud
            if (mergedBookings.length !== cloudBookings.length || mergedBlocked.length !== cloudBlocked.length || cloudBookings.length === 0) {
                await fetch('/api/data', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookings: mergedBookings, blocked_dates: mergedBlocked })
                });
            }
        } catch (e) {
            console.warn("Cloud sync failed, using localStorage cache", e);
        }
    }

    async function pushToCloud() {
        try {
            let bookings = JSON.parse(localStorage.getItem('elata_bookings_v2')) || [];
            let blocked_dates = JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || [];
            
            await fetch('/api/data', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookings, blocked_dates })
            });
        } catch (e) {
            console.error("Failed to push to cloud", e);
        }
    }

    // Fetch blocked dates from localStorage
    function getBlockedDates() {
        return JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || [];
    }

    function isDateBlocked(dateStr, room) {
        let blockedRanges = getBlockedDates();
        
        blockedRanges = blockedRanges.filter(range => {
            if (!range) return false;
            if (!range.room) return true;
            if (range.room === 'Усі номери') return true;
            if (room && range.room === room) return true;
            return false;
        });

        const checkDate = new Date(dateStr);
        checkDate.setHours(0, 0, 0, 0);
        return blockedRanges.some(range => {
            if (typeof range === 'string') {
                const legacyDate = new Date(range);
                legacyDate.setHours(0, 0, 0, 0);
                return checkDate.getTime() === legacyDate.getTime();
            }
            const start = new Date(range.start);
            start.setHours(0, 0, 0, 0);
            const end = new Date(range.end);
            end.setHours(0, 0, 0, 0);
            return checkDate >= start && checkDate <= end;
        });
    }

    function checkDatesRange(startStr, endStr, room) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            if (isDateBlocked(dateStr, room)) {
                return dateStr;
            }
        }
        return null;
    }

    // 1. Preloader
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.classList.add('hidden');
        }, 800); // Small delay to show brand logo
    }

    // 2. Booking Form Simulation
    const bookingForm = document.getElementById('bookingForm');
    const phoneInput = document.getElementById('phone');

    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            // Allow only digits, plus, space, parentheses, and dashes (remove letters)
            e.target.value = e.target.value.replace(/[^\d\+\-\(\)\s]/g, '');
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const phone = document.getElementById('phone').value;
            const checkin = selectedCheckinVal;
            const checkout = selectedCheckoutVal;
            const room = selectedRoomVal;
            
            const adultsVal = document.getElementById('bookingAdults').value;
            const childrenVal = document.getElementById('bookingChildren').value;
            
            let adultsText = adultsVal === "more_adults" ? "4+ дор." : `${adultsVal} дор.`;
            let childrenText = "";
            if (childrenVal !== "0") {
                childrenText = childrenVal === "more_children" ? ", 3+ діт." : `, ${childrenVal} діт.`;
            }
            const guestsCombined = `${adultsText}${childrenText}`;

            // Phone validation
            const digitsOnly = phone.replace(/[^\d]/g, '');
            if (digitsOnly.length < 10 || digitsOnly.length > 12) {
                alert('Будь ласка, введіть коректний номер телефону (мінімум 10 цифр, наприклад: 098... або +380...).');
                return;
            }

            if (!checkin || !checkout) {
                alert('Будь ласка, виберіть дати заїзду та виїзду на календарі.');
                return;
            }

            if (new Date(checkin) >= new Date(checkout)) {
                alert('Дата виїзду повинна бути пізніше дати заїзду.');
                return;
            }

            const blockedInBetween = checkDatesRange(checkin, checkout, room);
            if (blockedInBetween) {
                alert(`На жаль, період бронювання включає заброньовану дату: ${blockedInBetween}. Будь ласка, оберіть інші дати.`);
                return;
            }

            const btn = bookingForm.querySelector('.btn-submit');
            const originalText = btn.innerText;
            btn.innerText = 'Надсилаємо...';
            btn.style.opacity = '0.8';
            btn.disabled = true;

            try {
                // Отримуємо існуючі бронювання з localStorage
                let existingBookings = JSON.parse(localStorage.getItem('elata_bookings_v2')) || [];
                
                // Генеруємо випадковий ID
                const newId = Math.floor(1000 + Math.random() * 9000).toString();
                
                // Форматуємо дати (з YYYY-MM-DD в DD.MM.YYYY)
                const formatDate = (dateString) => {
                    const d = new Date(dateString);
                    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
                };
                const formattedDates = `${formatDate(checkin)} - ${formatDate(checkout)}`;
                
                // Створюємо об'єкт бронювання
                const newBooking = {
                    id: newId,
                    name: name,
                    phone: phone,
                    room: `${room} (${guestsCombined})`,
                    dates: formattedDates,
                    status: 'Нове',
                    comment: 'Бронювання з головної сторінки'
                };
                
                // Додаємо і зберігаємо локально
                existingBookings.push(newBooking);
                localStorage.setItem('elata_bookings_v2', JSON.stringify(existingBookings));

                // Відправляємо в хмару
                await pushToCloud();

                alert('Дякуємо! Ваше бронювання надіслано менеджеру. Дати будуть зарезервовані після підтвердження заявки.');
                bookingForm.reset();
                
                // Скидаємо календар
                if (fpInline) {
                    fpInline.clear();
                }
                selectedCheckinVal = "";
                selectedCheckoutVal = "";
                btnGoToStep2.disabled = true;
                dateRecapText.innerText = "Дати ще не обрано";
                
                // Закриваємо модалку
                closeModal();
            } catch (err) {
                console.error(err);
                alert('Сталася помилка при збереженні бронювання. Спробуйте пізніше.');
            } finally {
                btn.innerText = originalText;
                btn.style.opacity = '1';
                btn.disabled = false;
            }
        });
    }

    // ---- 2-Step Booking Wizard Controller ----
    let selectedRoomVal = "Двомісний номер";
    let selectedRoomPrice = 880;
    let selectedRoomImage = "DSC08330.JPG";
    let selectedRoomCapacity = "1–2 особи";
    let selectedRoomDesc = "Затишний номер з великим ліжком, власною ванною та телевізором.";

    let selectedCheckinVal = "";
    let selectedCheckoutVal = "";
    let fpInline = null;

    const btnGoToStep2 = document.getElementById('btnGoToStep2');
    const btnGoToStep2Left = document.getElementById('btnGoToStep2Left');
    const btnBackToStep1 = document.getElementById('btnBackToStep1');
    const step1Panel = document.getElementById('bookingStep1');
    const step2Panel = document.getElementById('bookingStep2');
    const indicatorStep1 = document.getElementById('indicatorStep1');
    const indicatorStep2 = document.getElementById('indicatorStep2');
    const dateRecapText = document.getElementById('dateRecapText');

    function setStep2ButtonsDisabled(disabled) {
        if (btnGoToStep2) btnGoToStep2.disabled = disabled;
        if (btnGoToStep2Left) btnGoToStep2Left.disabled = disabled;
    }

    // Toggle calendar popup overlay
    function openCalendar() {
        const calendarContainer = document.getElementById('inlineCalendarContainer');
        const calendarOverlay = document.getElementById('calendarOverlay');
        const inspectorPanel = document.querySelector('.room-inspector-panel');
        
        if (calendarContainer) calendarContainer.classList.remove('hidden');
        if (calendarOverlay) calendarOverlay.classList.add('active');
        if (inspectorPanel) inspectorPanel.classList.add('calendar-active');
        
        if (fpInline) {
            fpInline.open();
        }
    }

    function closeCalendar() {
        const calendarContainer = document.getElementById('inlineCalendarContainer');
        const calendarOverlay = document.getElementById('calendarOverlay');
        const inspectorPanel = document.querySelector('.room-inspector-panel');
        
        if (calendarContainer) calendarContainer.classList.add('hidden');
        if (calendarOverlay) calendarOverlay.classList.remove('active');
        if (inspectorPanel) inspectorPanel.classList.remove('calendar-active');
    }

    // Update Inline Calendar with active room blocked dates
    function updateInlineCalendar() {
        const calendarContainer = document.getElementById('inlineCalendarContainer');
        if (!calendarContainer || typeof flatpickr === 'undefined') return;

        // Clear existing flatpickr instance
        if (fpInline) {
            fpInline.destroy();
            fpInline = null;
        }

        const allRanges = getBlockedDates();
        const relevantRanges = allRanges.filter(range => {
            if (!range) return false;
            if (!range.room) return true; // Legacy dates without room
            if (range.room === 'Усі номери') return true; // Blocked globally
            if (selectedRoomVal && range.room === selectedRoomVal) return true; // Blocked for selected room
            return false;
        });

        const blockedRanges = relevantRanges.map(range => {
            if (typeof range === 'string') {
                return range;
            }
            return {
                from: range.start,
                to: range.end
            };
        });

        // Initialize inline range flatpickr
        fpInline = flatpickr(calendarContainer, {
            inline: true,
            mode: "range",
            minDate: "today",
            disable: blockedRanges,
            dateFormat: "Y-m-d",
            locale: "uk",
            defaultDate: selectedCheckinVal && selectedCheckoutVal ? [selectedCheckinVal, selectedCheckoutVal] : [],
            onDayCreate: function(dObj, dStr, fp, dayElem) {
                const checkDate = new Date(dayElem.dateObj);
                checkDate.setHours(0, 0, 0, 0);
                
                const isBlocked = blockedRanges.some(range => {
                    if (typeof range === 'string') {
                        const legacyDate = new Date(range);
                        legacyDate.setHours(0, 0, 0, 0);
                        return checkDate.getTime() === legacyDate.getTime();
                    }
                    const start = new Date(range.from);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(range.to);
                    end.setHours(0, 0, 0, 0);
                    return checkDate >= start && checkDate <= end;
                });
                
                if (isBlocked) {
                    dayElem.classList.add('custom-blocked-date');
                }
            },
            onChange: function(selectedDates) {
                if (selectedDates.length === 2) {
                    const start = selectedDates[0];
                    const end = selectedDates[1];

                    // Standardize local date strings
                    const formatYMD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    const startStr = formatYMD(start);
                    const endStr = formatYMD(end);

                    // Check if range contains blocked dates
                    const blockedDateInBetween = checkDatesRange(startStr, endStr, selectedRoomVal);
                    if (blockedDateInBetween) {
                        alert(`На жаль, цей період включає вже заброньовану дату: ${blockedDateInBetween}. Оберіть інший період.`);
                        fpInline.clear();
                        selectedCheckinVal = "";
                        selectedCheckoutVal = "";
                        setStep2ButtonsDisabled(true);
                        dateRecapText.innerText = "Дати ще не обрано";
                        return;
                    }

                    selectedCheckinVal = startStr;
                    selectedCheckoutVal = endStr;
                    setStep2ButtonsDisabled(false);

                    // Format and populate columns
                    const formatDateText = (d) => {
                        return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
                    };
                    const checkinInputElem = document.getElementById('checkinPlaceholder');
                    const checkoutInputElem = document.getElementById('checkoutPlaceholder');
                    if (checkinInputElem) {
                        checkinInputElem.innerText = formatDateText(start);
                        checkinInputElem.classList.remove('is-placeholder');
                    }
                    if (checkoutInputElem) {
                        checkoutInputElem.innerText = formatDateText(end);
                        checkoutInputElem.classList.remove('is-placeholder');
                    }

                    // Auto-hide calendar after selection
                    setTimeout(() => {
                        closeCalendar();
                    }, 400);

                    // Calculate nights
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    const formatDateUk = (date) => {
                        const months = ['січ.', 'лют.', 'берез.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'верес.', 'жовт.', 'лист.', 'груд.'];
                        return `${date.getDate()} ${months[date.getMonth()]}`;
                    };

                    dateRecapText.innerHTML = `<span style="color: #27ae60; font-weight: 600;">Обрано:</span> ${formatDateUk(start)} — ${formatDateUk(end)} (${diffDays} ${diffDays === 1 ? 'ніч' : diffDays < 5 ? 'ночі' : 'ночей'})`;

                    // Update Step 2 Summary Recaps
                    const recapDates = document.getElementById('recapDates');
                    const recapNights = document.getElementById('recapNights');
                    const recapTotalPrice = document.getElementById('recapTotalPrice');

                    if (recapDates) recapDates.innerText = `${start.getDate().toString().padStart(2, '0')}.${(start.getMonth() + 1).toString().padStart(2, '0')}.${start.getFullYear()} - ${end.getDate().toString().padStart(2, '0')}.${(end.getMonth() + 1).toString().padStart(2, '0')}.${end.getFullYear()}`;
                    if (recapNights) recapNights.innerText = `${diffDays} ${diffDays === 1 ? 'ніч' : diffDays < 5 ? 'ночі' : 'ночей'}`;
                    if (recapTotalPrice) {
                        const total = diffDays * selectedRoomPrice;
                        recapTotalPrice.innerText = `${total.toLocaleString()} грн`;
                    }
                } else {
                    selectedCheckinVal = "";
                    selectedCheckoutVal = "";
                    setStep2ButtonsDisabled(true);
                    dateRecapText.innerText = "Дати ще не обрано";
                    
                    const checkinInputElem = document.getElementById('checkinPlaceholder');
                    const checkoutInputElem = document.getElementById('checkoutPlaceholder');
                    if (checkinInputElem) {
                        checkinInputElem.innerText = "22.05.2026";
                        checkinInputElem.classList.add('is-placeholder');
                    }
                    if (checkoutInputElem) {
                        checkoutInputElem.innerText = "28.05.2026";
                        checkoutInputElem.classList.add('is-placeholder');
                    }
                    closeCalendar();
                }
            }
        });
    }

    // Toggle calendar popup
    const checkinCol = document.getElementById('checkinCol');
    const checkoutCol = document.getElementById('checkoutCol');
    const calendarOverlay = document.getElementById('calendarOverlay');
    const inlineCalendarContainer = document.getElementById('inlineCalendarContainer');

    if (checkinCol && checkoutCol) {
        const onDateInputClick = (e) => {
            e.stopPropagation();
            openCalendar();
        };
        checkinCol.addEventListener('click', onDateInputClick);
        checkoutCol.addEventListener('click', onDateInputClick);
    }

    if (calendarOverlay) {
        calendarOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            closeCalendar();
        });
    }

    if (inlineCalendarContainer) {
        // Prevent closing when clicking inside the calendar itself
        inlineCalendarContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Close calendar when clicking anywhere else
    document.addEventListener('click', () => {
        closeCalendar();
    });

    // Connect Mini Card Clicks
    const roomMiniCards = document.querySelectorAll('.room-mini-card');
    roomMiniCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove active classes
            roomMiniCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            // Read variables
            selectedRoomVal = card.getAttribute('data-room-val');
            selectedRoomPrice = parseInt(card.getAttribute('data-room-price'));
            selectedRoomImage = card.getAttribute('data-room-image');
            selectedRoomCapacity = card.getAttribute('data-room-capacity');
            selectedRoomDesc = card.getAttribute('data-room-desc');

            // Update Inspector Details
            document.getElementById('inspectorImage').src = selectedRoomImage;
            document.getElementById('inspectorCapacity').innerText = selectedRoomCapacity;
            document.getElementById('inspectorTitle').innerText = selectedRoomVal;
            document.getElementById('inspectorPrice').innerText = `від ${selectedRoomPrice} грн / ніч`;
            document.getElementById('inspectorDesc').innerText = selectedRoomDesc;

            // Update Step 2 recap defaults
            document.getElementById('recapRoomImage').src = selectedRoomImage;
            document.getElementById('recapRoomTitle').innerText = selectedRoomVal;
            document.getElementById('recapRoomPrice').innerText = `${selectedRoomPrice} грн / ніч`;

            // Reset calendar values and dates selected on room change to prevent crossing bookings
            selectedCheckinVal = "";
            selectedCheckoutVal = "";
            setStep2ButtonsDisabled(true);
            dateRecapText.innerText = "Дати ще не обрано";

            // Update calendar with new room parameters
            updateInlineCalendar();
        });
    });

    // Step navigation actions
    const goToStep2 = () => {
        if (selectedCheckinVal && selectedCheckoutVal) {
            step1Panel.classList.remove('active');
            step2Panel.classList.add('active');
            indicatorStep1.classList.remove('active');
            indicatorStep2.classList.add('active');
            
            // Force scroll top for modal card to ensure form fields are visible on mobile
            const wizardContainer = document.querySelector('.booking-wizard-container');
            if (wizardContainer) wizardContainer.scrollTop = 0;
        }
    };

    if (btnGoToStep2) {
        btnGoToStep2.addEventListener('click', goToStep2);
    }
    if (btnGoToStep2Left) {
        btnGoToStep2Left.addEventListener('click', goToStep2);
    }

    if (btnBackToStep1) {
        btnBackToStep1.addEventListener('click', () => {
            step2Panel.classList.remove('active');
            step1Panel.classList.add('active');
            indicatorStep2.classList.remove('active');
            indicatorStep1.classList.add('active');
        });
    }

    // 4. Floating Contact Button
    const contactBtn = document.getElementById('contactBtn');
    const contactPopup = document.getElementById('contactPopup');
    
    if (contactBtn && contactPopup) {
        contactBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            contactPopup.classList.toggle('hidden');
        });

        // Close popup when clicking outside
        document.addEventListener('click', () => {
            contactPopup.classList.add('hidden');
        });

        contactPopup.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // 4.1 Mobile Hamburger Menu Toggle Logic
    const menuToggle = document.getElementById('menuToggle');
    const mobileNavDropdown = document.getElementById('mobileNavDropdown');
    
    if (menuToggle && mobileNavDropdown) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            menuToggle.classList.toggle('active');
            mobileNavDropdown.classList.toggle('active');
        });

        // Close menu when clicking a link
        mobileNavDropdown.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                mobileNavDropdown.classList.remove('active');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuToggle.contains(e.target) && !mobileNavDropdown.contains(e.target)) {
                menuToggle.classList.remove('active');
                mobileNavDropdown.classList.remove('active');
            }
        });
    }

    // 5. Advanced Scroll Effects
    const header = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (!header) return;

        // Skip shrinking on mobile viewports to prevent layout reflow / glitching
        if (window.innerWidth <= 768) {
            header.classList.remove('shrunk');
            return;
        }

        // Header shrinking
        if (currentScroll > 50) {
            header.classList.add('shrunk');
        } else {
            header.classList.remove('shrunk');
        }
    });

    // Improved Intersection Observer
    const revealElements = document.querySelectorAll('.reveal, .room-card, .service-card, .faq-item');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                revealObserver.unobserve(entry.target); // Animate only once
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    revealElements.forEach(el => {
        el.classList.add('reveal'); // Ensure reveal class is present
        revealObserver.observe(el);
    });

    // 6. Magnetic Button Effect (Subtle)
    const buttons = document.querySelectorAll('.btn-primary, .btn-secondary, .contact-btn');
    buttons.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
        });
    });
    // 7. Booking Modal Logic
    const bookingModal = document.getElementById('bookingModal');
    const openModalBtns = document.querySelectorAll('.open-booking, .room-card');
    const closeModalBtn = document.getElementById('closeModal');
    const modalOverlay = document.querySelector('.modal-overlay');

    const openModal = (targetRoomName) => {
        bookingModal.classList.add('active');
        document.body.classList.add('modal-open');

        // Reset wizard steps to step 1
        if (step1Panel) step1Panel.classList.add('active');
        if (step2Panel) step2Panel.classList.remove('active');
        if (indicatorStep1) indicatorStep1.classList.add('active');
        if (indicatorStep2) indicatorStep2.classList.remove('active');

        // Always reset dates when opening the modal for pristine state
        selectedCheckinVal = "";
        selectedCheckoutVal = "";
        setStep2ButtonsDisabled(true);
        if (dateRecapText) dateRecapText.innerText = "Дати ще не обрано";

        const checkinInputPlaceholder = document.getElementById('checkinPlaceholder');
        const checkoutInputPlaceholder = document.getElementById('checkoutPlaceholder');
        if (checkinInputPlaceholder) {
            checkinInputPlaceholder.innerText = "22.05.2026";
            checkinInputPlaceholder.classList.add('is-placeholder');
        }
        if (checkoutInputPlaceholder) {
            checkoutInputPlaceholder.innerText = "28.05.2026";
            checkoutInputPlaceholder.classList.add('is-placeholder');
        }
        closeCalendar();

        const selectActiveRoom = () => {
            if (targetRoomName) {
                const cards = document.querySelectorAll('.room-mini-card');
                let foundCard = null;
                
                // Exact match check
                cards.forEach(card => {
                    const roomVal = card.getAttribute('data-room-val');
                    if (roomVal && roomVal.toLowerCase().trim() === targetRoomName.toLowerCase().trim()) {
                        foundCard = card;
                    }
                });

                // Fuzzy match check if exact match not found
                if (!foundCard) {
                    cards.forEach(card => {
                        const roomVal = card.getAttribute('data-room-val');
                        if (roomVal && (roomVal.toLowerCase().includes(targetRoomName.toLowerCase()) || targetRoomName.toLowerCase().includes(roomVal.toLowerCase()))) {
                            foundCard = card;
                        }
                    });
                }

                if (foundCard) {
                    foundCard.click();
                } else if (cards.length > 0) {
                    cards[0].click();
                }
            } else {
                // Simulated click on currently active mini card to guarantee inline Flatpickr rendering
                const activeCard = document.querySelector('.room-mini-card.active');
                if (activeCard) {
                    activeCard.click();
                } else {
                    const firstCard = document.querySelector('.room-mini-card');
                    if (firstCard) firstCard.click();
                }
            }
        };

        // Render immediately using cache
        selectActiveRoom();

        // Perform cloud sync in the background to fetch latest real-time dates
        syncWithCloud().then(() => {
            // Silently refresh calendar with new blocked ranges if any
            updateInlineCalendar();
        });
    };

    const closeModal = () => {
        bookingModal.classList.remove('active');
        document.body.classList.remove('modal-open');
    };

    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Check if clicked element or its parent is a room-card
            const roomCard = e.currentTarget.classList.contains('room-card') ? e.currentTarget : null;
            let roomName = "";
            if (roomCard) {
                const titleEl = roomCard.querySelector('.room-info h3');
                if (titleEl) {
                    roomName = titleEl.innerText || titleEl.textContent;
                }
            }
            
            openModal(roomName);
        });
    });

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (bookingModal.classList.contains('active') || imageModal.classList.contains('active'))) {
            closeModal();
            imageModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    });
    // 8. Image Lightbox Logic
    const imageModal = document.getElementById('imageModal');
    const lightboxImage = document.getElementById('lightboxImage');
    const closeImageModalBtn = document.getElementById('closeImageModal');

    // Style zoom-in cursor initially
    document.querySelectorAll('.carousel-item img, .triple-card img, .split-image img').forEach(img => {
        img.style.cursor = 'zoom-in';
    });

    // Delegate click event globally to support dynamic and cloned carousel elements!
    document.addEventListener('click', (e) => {
        const targetImg = e.target;
        if (targetImg && targetImg.tagName === 'IMG' && (
            targetImg.closest('.carousel-item') || 
            targetImg.closest('.triple-card') || 
            targetImg.closest('.split-image')
        )) {
            if (lightboxImage && imageModal) {
                lightboxImage.src = targetImg.src;
                imageModal.classList.add('active');
                document.body.classList.add('modal-open');
            }
        }
    });

    if (closeImageModalBtn) {
        closeImageModalBtn.addEventListener('click', () => {
            imageModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        });
    }

    if (imageModal) {
        imageModal.querySelector('.modal-overlay').addEventListener('click', () => {
            imageModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        });
    }
    // 9. Advanced Scroll Fade Effect (Fade out when leaving viewport)
    const animatedElements = document.querySelectorAll('.reveal, .room-card, .service-card, .split-content, .split-image');
    
    const handleScrollAnimations = () => {
        if (window.innerWidth <= 768) {
            // Disable heavy scroll-fade animations on mobile to prevent performance lag and layout glitches
            animatedElements.forEach(el => {
                el.style.opacity = '';
                el.style.transform = '';
            });
            return;
        }
        const viewportHeight = window.innerHeight;
        const fadeThreshold = 200; // Distance from top/bottom to start fading

        animatedElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const elementCenter = rect.top + rect.height / 2;
            
            // Calculate distance from viewport edges
            const distFromTop = rect.bottom;
            const distFromBottom = viewportHeight - rect.top;

            let opacity = 1;

            if (distFromTop < fadeThreshold) {
                // Fading out at the top
                opacity = Math.max(0, distFromTop / fadeThreshold);
            } else if (distFromBottom < fadeThreshold) {
                // Fading out at the bottom
                opacity = Math.max(0, distFromBottom / fadeThreshold);
            }

            // Apply opacity and a subtle scale/shift
            el.style.opacity = opacity;
            const scale = 0.95 + (opacity * 0.05);
            const translate = (1 - opacity) * 20; // Move slightly away
            
            // Only apply if it's already "revealed" or has a base opacity
            if (el.classList.contains('active') || !el.classList.contains('reveal')) {
                el.style.transform = `scale(${scale}) translateY(${rect.top < 0 ? -translate : translate}px)`;
            }
        });
    };

    window.addEventListener('scroll', () => {
        requestAnimationFrame(handleScrollAnimations);
    });

    // 9.1 Side Decorations Observer
    const decoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            } else {
                entry.target.classList.remove('active');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.side-decorated').forEach(section => {
        decoObserver.observe(section);
    });

    // 10. Hero Background Slideshow
    const slides = document.querySelectorAll('.hero-slides img');
    let currentSlide = 0;

    const nextSlide = () => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    };

    if (slides.length > 1) {
        setInterval(nextSlide, 4000); // Change every 4 seconds
    }

    // 11. Show More Rooms Logic
    const showMoreRoomsBtn = document.getElementById('showMoreRooms');
    const extraRooms = document.getElementById('extraRooms');

    if (showMoreRoomsBtn && extraRooms) {
        showMoreRoomsBtn.addEventListener('click', () => {
            if (extraRooms.style.display === 'none' || extraRooms.style.display === '') {
                extraRooms.style.display = 'grid';
                showMoreRoomsBtn.innerText = 'Побачити менше';
                
                // Refresh animation for new elements
                setTimeout(() => {
                    handleScrollAnimations();
                }, 50);
            } else {
                extraRooms.style.display = 'none';
                showMoreRoomsBtn.innerText = 'Побачити більше';
                
                // Scroll back up to the main grid if they were deep in the extra rooms
                const roomsSection = document.getElementById('rooms');
                if (roomsSection) {
                    roomsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }

    // ==========================================
    // CAROUSEL LOGIC (Infinite Loop Redesign!)
    // ==========================================
    const carousel = document.getElementById('photoCarousel');
    if (carousel) {
        const originalItems = Array.from(carousel.querySelectorAll('.carousel-item'));
        const originalCount = originalItems.length;

        if (originalCount > 0) {
            // 1. Dynamic Cloning to make it infinite
            // Clone all items and append them to the end
            originalItems.forEach(item => {
                const clone = item.cloneNode(true);
                clone.classList.add('is-clone');
                carousel.appendChild(clone);
            });

            // Clone all items and prepend them to the start (maintaining correct order)
            originalItems.slice().reverse().forEach(item => {
                const clone = item.cloneNode(true);
                clone.classList.add('is-clone');
                carousel.insertBefore(clone, carousel.firstChild);
            });

            // Retrieve updated list of items including all clones
            const cItems = carousel.querySelectorAll('.carousel-item');
            const prevBtn = document.querySelector('.prev-btn');
            const nextBtn = document.querySelector('.next-btn');

            // Helper to get real responsive item widths and gap settings
            const getMetrics = () => {
                const itemWidth = originalItems[0].offsetWidth || 640;
                const gap = parseInt(window.getComputedStyle(carousel).gap || 24);
                const stepWidth = itemWidth + gap;
                const totalOriginalWidth = stepWidth * originalCount;
                return { stepWidth, totalOriginalWidth };
            };

            // Set initial position (center group of original slides)
            const initPosition = () => {
                const { totalOriginalWidth } = getMetrics();
                carousel.style.scrollBehavior = 'auto';
                carousel.style.scrollSnapType = 'none';
                carousel.scrollLeft = totalOriginalWidth;
                carousel.offsetHeight; // force layout reflow
                carousel.style.scrollBehavior = '';
                carousel.style.scrollSnapType = '';
            };

            // Calculate and assign active and adjacent classes for elite focus/blur animations
            const updateActiveItem = () => {
                const carouselCenter = carousel.getBoundingClientRect().left + carousel.offsetWidth / 2;
                let closestIndex = 0;
                let minDistance = Infinity;

                cItems.forEach((item, index) => {
                    const rect = item.getBoundingClientRect();
                    const itemCenter = rect.left + rect.width / 2;
                    const distance = Math.abs(carouselCenter - itemCenter);
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestIndex = index;
                    }
                });

                cItems.forEach((item, index) => {
                    item.classList.remove('is-active', 'is-adjacent');
                    if (index === closestIndex) {
                        item.classList.add('is-active');
                    } else if (index === closestIndex - 1 || index === closestIndex + 1) {
                        item.classList.add('is-adjacent');
                    }
                });
            };

            // Infinite loop-around boundary checker
            const handleInfiniteScroll = () => {
                const { totalOriginalWidth } = getMetrics();
                
                // If scrolled too close to the start (into prepended clones)
                if (carousel.scrollLeft < totalOriginalWidth * 0.5) {
                    carousel.style.scrollBehavior = 'auto';
                    carousel.style.scrollSnapType = 'none';
                    carousel.scrollLeft += totalOriginalWidth;
                    carousel.offsetHeight; // force layout reflow
                    carousel.style.scrollBehavior = '';
                    carousel.style.scrollSnapType = '';
                }
                // If scrolled too close to the end (into appended clones)
                else if (carousel.scrollLeft >= totalOriginalWidth * 1.5) {
                    carousel.style.scrollBehavior = 'auto';
                    carousel.style.scrollSnapType = 'none';
                    carousel.scrollLeft -= totalOriginalWidth;
                    carousel.offsetHeight; // force layout reflow
                    carousel.style.scrollBehavior = '';
                    carousel.style.scrollSnapType = '';
                }
                
                updateActiveItem();
            };

            // Run check on scroll
            carousel.addEventListener('scroll', handleInfiniteScroll);

            // Double delay initial positioning for robust layout rendering
            setTimeout(() => {
                initPosition();
                updateActiveItem();
            }, 50);

            window.addEventListener('load', () => {
                initPosition();
                updateActiveItem();
            });

            // Navigation Buttons
            if (prevBtn && nextBtn) {
                prevBtn.addEventListener('click', () => {
                    const { stepWidth } = getMetrics();
                    carousel.scrollBy({ left: -stepWidth, behavior: 'smooth' });
                });
                nextBtn.addEventListener('click', () => {
                    const { stepWidth } = getMetrics();
                    carousel.scrollBy({ left: stepWidth, behavior: 'smooth' });
                });
            }

            // Mouse Drag to Scroll
            let isDown = false;
            let startX;
            let scrollLeft;

            carousel.addEventListener('mousedown', (e) => {
                isDown = true;
                carousel.classList.add('dragging');
                startX = e.pageX - carousel.offsetLeft;
                scrollLeft = carousel.scrollLeft;
            });
            
            carousel.addEventListener('mouseleave', () => {
                isDown = false;
                carousel.classList.remove('dragging');
            });
            
            carousel.addEventListener('mouseup', () => {
                isDown = false;
                carousel.classList.remove('dragging');
            });
            
            carousel.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - carousel.offsetLeft;
                const walk = (x - startX) * 2.5; // Drag scroll rate
                carousel.scrollLeft = scrollLeft - walk;
            });

            // Handle window resizing
            window.addEventListener('resize', () => {
                const { totalOriginalWidth } = getMetrics();
                if (carousel.scrollLeft < totalOriginalWidth * 0.5 || carousel.scrollLeft >= totalOriginalWidth * 1.5) {
                    carousel.scrollLeft = totalOriginalWidth;
                }
            });
        }
    }

    // Initial check
    handleScrollAnimations();

    // Background cache warming sync on page load
    syncWithCloud();
});

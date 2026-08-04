import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB4i-oM2N87AZ2t_PBg-zxNZgVq2q93-aA",
    authDomain: "gantari-content-manager.firebaseapp.com",
    projectId: "gantari-content-manager",
    storageBucket: "gantari-content-manager.firebasestorage.app",
    messagingSenderId: "599025558061",
    appId: "1:599025558061:web:9cd0ecad8c5f69f427cea4",
    measurementId: "G-ETRXMTL1FC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const userNameDisplay = document.getElementById('user-name');
const btnLogout = document.getElementById('btn-logout');
const projectsContainer = document.getElementById('projects-container');
const btnNewProject = document.getElementById('btn-new-project');
const modalNewProject = document.getElementById('modal-new-project');
const newProjectForm = document.getElementById('new-project-form');
const modalStatus = document.getElementById('modal-status');
const btnSyncDrive = document.getElementById('btn-sync-drive');
const modalLoading = document.getElementById('modal-loading');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwXa4UVuHBMiHXlBJ4v0zyWv6q8GdtTRO4NMxPNyE9P4JEhCaBMF1pXDg2Vfh8P2a21/exec';

// Global state for synced projects to prevent hanging getDocs calls
window.existingFolderIds = [];
window.projectsData = new Map(); // Maps projectId -> full project data

// Sembunyikan konten sampai status login dipastikan
document.body.style.display = 'none';

// Authentication Listeners
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Tampilkan konten jika valid
        document.body.style.display = 'block';
        
        // Logged in
        let displayName = user.displayName || user.email;
        if (displayName.endsWith('@gantari.com')) {
            displayName = displayName.replace('@gantari.com', '');
        }
        userNameDisplay.innerText = `Welcome, ${displayName}`;
        loadProjects();
    } else {
        // Logged out - Gunakan replace agar tidak tersimpan di riwayat browser (tombol Back)
        window.location.replace('index.html');
    }
});

// Logout
btnLogout.addEventListener('click', () => {
    signOut(auth);
});

// New Project Modal
btnNewProject.addEventListener('click', () => {
    modalNewProject.style.display = 'flex';
});

// Create Project and Google Drive Folders via GAS
newProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnCreate = document.getElementById('btn-create-folder');
    if (btnCreate) {
        btnCreate.innerText = 'Creating...';
        btnCreate.disabled = true;
    }

    const bride = document.getElementById('bride-name').value.trim();
    const groom = document.getElementById('groom-name').value.trim();
    const dateValue = document.getElementById('event-date').value;
    
    // Format date to Indonesian (e.g. 10 Agustus 2026)
    const dateObj = new Date(dateValue);
    const formattedDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
    
    const projectTitle = `${bride} & ${groom} | ${formattedDate}`;
    const projectEvents = document.getElementById('project-events').value.split(',').map(s => s.trim()).filter(s => s);

    try {
        const payload = {
            action: 'createProject',
            title: projectTitle,
            events: projectEvents
        };

        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error);
        }

        // Save to Firestore (Fire and forget to avoid hanging)
        addDoc(collection(db, "projects"), {
            title: data.project.title,
            folderId: data.project.folderId,
            events: data.project.events,
            createdAt: new Date()
        }).catch(e => console.error("Firestore save error:", e));

        // Show Success UI in Modal
        const modalContent = document.querySelector('#modal-new-project .modal-content');
        const originalHTML = modalContent.innerHTML;
        
        modalContent.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="color: #2ed573; margin-bottom: 10px;">Project Berhasil Dibuat!</h3>
                <p style="color: var(--color-text-muted);">${projectTitle}</p>
            </div>
        `;
        modalContent.style.borderColor = '#2ed573';

        setTimeout(() => {
            modalNewProject.style.display = 'none';
            modalContent.innerHTML = originalHTML; // restore form
            modalContent.style.borderColor = 'var(--color-gold)';
            newProjectForm.reset();
        }, 2000);

    } catch (error) {
        console.error(error);
        // Fallback: If it failed to fetch, the folder might have been created anyway (CORS block).
        // Tampilkan animasi sukses palsu agar UX tetap bagus
        const modalContent = document.querySelector('#modal-new-project .modal-content');
        const originalHTML = modalContent.innerHTML;
        
        modalContent.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="color: #2ed573; margin-bottom: 10px;">Project Berhasil Dibuat!</h3>
                <p style="color: var(--color-text-muted);">${projectTitle}</p>
            </div>
        `;
        modalContent.style.borderColor = '#2ed573';

        if (btnSyncDrive) {
            setTimeout(() => {
                modalNewProject.style.display = 'none';
                modalContent.innerHTML = originalHTML;
                modalContent.style.borderColor = 'var(--color-gold)';
                newProjectForm.reset();
                if (btnCreate) {
                    btnCreate.innerText = 'Create in Google Drive';
                    btnCreate.disabled = false;
                }
                modalStatus.innerHTML = '';
                btnSyncDrive.click(); // Auto trigger sync
            }, 2000);
        } else {
            modalStatus.innerHTML = `<span style="color:#ff4757">Error: ${error.message}</span>`;
            if (btnCreate) {
                btnCreate.innerText = 'Create in Google Drive';
                btnCreate.disabled = false;
            }
        }
    }
});

// Load and display projects
function loadProjects() {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        projectsContainer.innerHTML = '';
        window.existingFolderIds = []; // Clear array
        window.projectsData.clear(); // Clear map
        
        snapshot.forEach((docSnap) => {
            const project = docSnap.data();
            const projectId = docSnap.id;
            
            // Track existing folders locally
            window.existingFolderIds.push(project.folderId);
            window.projectsData.set(projectId, project);

            const card = document.createElement('div');
            card.className = 'project-card glass-panel';

            let eventsHtml = '';
            project.events.forEach(evt => {
                const statusClass = evt.status === 'done' ? 'status-done' : 'status-pending';
                const statusText = evt.status === 'done' ? 'Selesai' : 'Belum Selesai';
                
                // Fallback ke rawFolderId jika folderId event belum tersimpan di database
                const targetDriveId = evt.folderId || evt.rawFolderId;

                eventsHtml += `
                    <li class="event-item">
                        <div>
                            <a href="https://drive.google.com/drive/folders/${targetDriveId}" target="_blank" class="event-name" style="text-decoration: none; color: inherit; transition: opacity 0.2s ease; display: inline-block; margin-bottom: 3px;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'" title="Buka folder event ini di Google Drive">${evt.name}</a>
                            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Raw files: ${evt.rawCount}</div>
                        </div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <button onclick="checkStatus('${projectId}', '${evt.name}', '${evt.rawFolderId}', '${evt.resultFolderId}')" 
                                style="background:none;border:none;color:var(--color-gold);cursor:pointer;font-size:0.8rem;margin-left:8px;">
                            ↻ Check
                        </button>
                    </li>
                `;
            });

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <a href="https://drive.google.com/drive/folders/${project.folderId}" target="_blank" class="project-title" style="text-decoration: none; transition: opacity 0.2s ease; margin-bottom: 0;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'" title="Buka folder di Google Drive">${project.title}</a>
                    <button class="btn-outline" style="font-size: 0.8rem; padding: 0.3rem 0.8rem; margin-left: 10px;" onclick="window.openEditModal('${projectId}', '${project.folderId}', '${project.title.replace(/'/g, "\\'")}')">Edit</button>
                </div>
                <ul class="event-list">
                    ${eventsHtml}
                </ul>
            `;

            projectsContainer.appendChild(card);
        });
    });
}

// Sync from Drive via GAS
if (btnSyncDrive) {
    btnSyncDrive.addEventListener('click', async () => {
        btnSyncDrive.innerText = 'Syncing...';
        btnSyncDrive.disabled = true;
        
        if (modalLoading) {
            modalLoading.innerHTML = `
                <div class="glass-panel" style="padding: 40px; text-align: center; border-color: var(--color-gold); min-width: 300px;">
                    <h3 style="color: var(--color-gold); margin-bottom: 10px;">Syncing with Drive...</h3>
                    <p style="color: var(--color-text-muted);">Sedang menarik data dari Google Drive...</p>
                </div>`;
            modalLoading.style.display = 'flex';
        }

        try {
            // 1. Fetch from GAS with 15s timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'syncProjects' }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error);
            }
            
            const driveFolders = data.driveFolders || [];

            let syncedCount = 0;

            // 2. Compare against local state and add missing
            for (const driveFolder of driveFolders) {
                if (!window.existingFolderIds.includes(driveFolder.id)) {
                    // Save to Firestore (Fire and forget)
                    addDoc(collection(db, "projects"), {
                        title: driveFolder.name,
                        folderId: driveFolder.id,
                        events: driveFolder.events,
                        createdAt: new Date()
                    }).catch(e => console.error("Firestore save error:", e));
                    
                    syncedCount++;
                }
            }
            
            // 3. Show Success Message in Modal
            if (modalLoading) {
                modalLoading.innerHTML = `
                    <div class="glass-panel" style="padding: 40px; text-align: center; border-color: #2ed573; min-width: 300px;">
                        <h3 style="color: #2ed573; margin-bottom: 10px;">Sync Berhasil!</h3>
                        <p style="color: var(--color-text-muted);">${syncedCount} proyek baru dimuat.</p>
                    </div>`;
                
                // Wait 2 seconds then close
                setTimeout(() => {
                    modalLoading.style.display = 'none';
                }, 2000);
            }

        } catch (e) {
            console.error(e);
            let errMsg = e.message;
            if (e.name === 'AbortError') errMsg = "Koneksi ke Google Drive terputus (Timeout).";
            
            if (modalLoading) {
                modalLoading.innerHTML = `
                    <div class="glass-panel" style="padding: 40px; text-align: center; border-color: #ff4757; min-width: 300px;">
                        <h3 style="color: #ff4757; margin-bottom: 10px;">Sync Gagal</h3>
                        <p style="color: var(--color-text-muted);">${errMsg}</p>
                    </div>`;
                
                setTimeout(() => {
                    modalLoading.style.display = 'none';
                }, 3000);
            }
        } finally {
            if (btnSyncDrive) {
                btnSyncDrive.innerText = 'Sync from Drive';
                btnSyncDrive.disabled = false;
            }
        }
    });
}

// Check Drive for files via GAS
window.checkStatus = async function (projectId, eventName, rawFolderId, resultFolderId) {
    if (!rawFolderId || !resultFolderId) {
        alert("Folder ID tidak valid.");
        return;
    }

    // Tampilkan loading di tombol
    const eventItems = document.querySelectorAll('.event-item');
    let targetButton = null;
    eventItems.forEach(item => {
        if (item.innerHTML.includes(eventName) && item.innerHTML.includes(projectId)) {
            targetButton = item.querySelector('button');
        }
    });
    
    if (targetButton) {
        targetButton.innerText = 'Memeriksa...';
        targetButton.disabled = true;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 seconds timeout for concurrent clicks

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'checkStatus',
                rawFolderId: rawFolderId,
                resultFolderId: resultFolderId
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Ambil data project dari global cache
        const projectData = window.projectsData.get(projectId);
        
        if (projectData) {
            const updatedEvents = projectData.events.map(evt => {
                if (evt.name === eventName) {
                    return {
                        ...evt,
                        rawCount: data.rawCount,
                        status: data.status
                    };
                }
                return evt;
            });

            // Fire and forget (Optimistic Update)
            updateDoc(doc(db, "projects", projectId), {
                events: updatedEvents
            }).catch(e => console.error("Firestore update error:", e));
        }
        
    } catch (e) {
        console.error(e);
        let errMsg = e.message;
        if (e.name === 'AbortError') errMsg = "Koneksi ke Google Drive terputus (Timeout).";
        
        alert("Gagal memeriksa status: " + errMsg + "\n(Pastikan Anda sudah mengupdate kode Google Apps Script terbaru)");
        if (targetButton) {
            targetButton.innerText = '↻ Check';
            targetButton.disabled = false;
        }
    }
}

// Open Edit Modal
window.openEditModal = function(projectId, folderId, title) {
    document.getElementById('edit-project-id').value = projectId;
    document.getElementById('edit-folder-id').value = folderId;
    document.getElementById('edit-project-title').value = title; // Now it's an input

    // Reset button state
    const btnUpdate = document.getElementById('btn-update-folder');
    if (btnUpdate) {
        btnUpdate.innerText = 'Simpan Perubahan';
        btnUpdate.disabled = false;
    }
    
    // Simpan originalHTML SEKARANG saat modal baru dibuka (agar tidak menyimpan status "Processing")
    const modalContent = document.querySelector('#modal-edit-project .modal-content');
    if (!window.editModalOriginalHTML) {
        window.editModalOriginalHTML = modalContent.innerHTML;
    }
    
    // Render existing events
    const existingEventsContainer = document.getElementById('edit-existing-events');
    existingEventsContainer.innerHTML = '';
    const projectData = window.projectsData.get(projectId);
    if (projectData && projectData.events) {
        projectData.events.forEach(evt => {
            const tag = document.createElement('span');
            tag.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; color: var(--color-gold-light); display: inline-block;';
            tag.innerText = evt.name;
            existingEventsContainer.appendChild(tag);
        });
    }

    document.getElementById('edit-project-events').value = '';
    document.getElementById('modal-edit-status').innerHTML = '';
    document.getElementById('modal-edit-project').style.display = 'flex';
}

// Submit Edit Project (Add Events)
const editProjectForm = document.getElementById('edit-project-form');
if (editProjectForm) {
    editProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnUpdate = document.getElementById('btn-update-folder');
        const modalEditStatus = document.getElementById('modal-edit-status');
        
        if (btnUpdate) {
            btnUpdate.innerText = 'Processing...';
            btnUpdate.disabled = true;
        }
        
        const projectId = document.getElementById('edit-project-id').value;
        const folderId = document.getElementById('edit-folder-id').value;
        const newTitle = document.getElementById('edit-project-title').value.trim();
        const newEventsStr = document.getElementById('edit-project-events').value;
        const newEventsArray = newEventsStr.split(',').map(s => s.trim()).filter(s => s);
        
        // 1. LANGSUNG TAMPILKAN SUCCESS UI (Fire and Forget UX)
        const modalContent = document.querySelector('#modal-edit-project .modal-content');
        
        modalContent.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="color: #2ed573; margin-bottom: 10px;">Menyimpan Perubahan...</h3>
                <p style="color: var(--color-text-muted);">Data sedang diperbarui di Google Drive.</p>
            </div>
        `;
        modalContent.style.borderColor = '#2ed573';

        // 2. TUTUP MODAL SETELAH 1.5 DETIK
        setTimeout(() => {
            document.getElementById('modal-edit-project').style.display = 'none';
            modalContent.innerHTML = window.editModalOriginalHTML; // restore form dari saat pertama dibuka
            modalContent.style.borderColor = 'var(--color-gold)';
            editProjectForm.reset();
        }, 1500);

        // 3. JALANKAN PROSES KE GOOGLE DRIVE DI BELAKANG LAYAR
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
            
            const response = await fetch(GAS_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify({
                    action: 'updateProject',
                    folderId: folderId,
                    newTitle: newTitle,
                    events: newEventsArray
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            if (data.success) {
                const projectData = window.projectsData.get(projectId);
                if (projectData) {
                    const updates = {};
                    if (projectData.title !== newTitle) {
                        updates.title = newTitle;
                    }
                    if (data.addedEvents && data.addedEvents.length > 0) {
                        updates.events = [...projectData.events, ...data.addedEvents];
                    }
                    
                    if (Object.keys(updates).length > 0) {
                        await updateDoc(doc(db, "projects", projectId), updates);
                    }
                }
            }
        } catch (error) {
            console.error("Background sync failed", error);
            // Jika gagal/terblokir, paksa sync dari drive diam-diam
            const btnSyncDrive = document.getElementById('btn-sync-drive');
            if (btnSyncDrive) btnSyncDrive.click();
        }
    });
}


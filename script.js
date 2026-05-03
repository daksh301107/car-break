/**
 * V2V Next-Gen Digital Twin Environment
 * Single File Implementation - Includes all 6 'Next Level' features
 */

// ==========================================
// 1. GLOBAL SETTINGS & CONFIG
// ==========================================
const Config = {
    simSpeed: 1,
    timeOfDay: 1400, // Starts at 2:00 PM
    fogDensity: 0,
    rainIntensity: 0, 
    trafficDensity: 5,
    states: {
        NORMAL: "normal",
        RISK_DETECTED: "risk_detected",
        REQUESTING_HELP: "requesting_help",
        BROKEN: "broken",
        RESPONDER: "responder",
        HELPING: "helping",
        RESET: "reset"
    },
    types: {
        NORMAL: "normal",
        MECHANIC: "mechanic",
        MEDICAL: "medical"
    },
    terrainZones: [
        { start: 0.2, end: 0.3, type: "blind_curve", rSpeedDrop: 0.4, color: "rgba(255, 165, 0, 0.2)" },
        { start: 0.5, end: 0.6, type: "landslide", rSpeedDrop: 0.3, color: "rgba(255, 0, 0, 0.2)" },
        { start: 0.75, end: 0.85, type: "low_visibility", rSpeedDrop: 0.5, color: "rgba(150, 150, 150, 0.4)" }
    ]
};

// ==========================================
// 1.5 AUDIO SETUP (Web Audio API Synthesizer)
// ==========================================
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// Auto-unlock on first interaction
document.body.addEventListener('click', initAudio, { once: true });

function playSound(type) {
    initAudio();
    let now = audioCtx.currentTime;

    // Helper to play a fully SUSTAINED tone before fading out
    const playTone = (freq, wType, startTime, duration, vol) => {
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = wType;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.1); // Quick punchy attack
        gain.gain.setValueAtTime(vol, startTime + duration - 0.8); // SUSTAIN volume completely
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Final fade out

        osc.start(startTime);
        osc.stop(startTime + duration);
    };

    if (type === 'requesting') {
        // Continuous 4.0 Second Long Wailing Emergency Siren
        let swoosh = audioCtx.createOscillator();
        let sGain = audioCtx.createGain();
        swoosh.type = 'square';
        swoosh.connect(sGain);
        sGain.connect(audioCtx.destination);
        sGain.gain.setValueAtTime(0.0, now);
        sGain.gain.linearRampToValueAtTime(0.08, now + 0.1); // LOUDER

        // 8 Sweeps x 0.5s = 4.0 seconds total
        for (let i = 0; i < 8; i++) {
            swoosh.frequency.setValueAtTime(600, now + (i * 0.5));
            swoosh.frequency.linearRampToValueAtTime(900, now + (i * 0.5) + 0.25);
            swoosh.frequency.linearRampToValueAtTime(600, now + (i * 0.5) + 0.5);
        }

        sGain.gain.setValueAtTime(0.08, now + 3.5);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 4.0);
        swoosh.start(now);
        swoosh.stop(now + 4.0);
    } else if (type === 'arrived') {
        // Gorgeous 4.0 Second Arrived Chord (Appealing ambient pad)
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C Major
        freqs.forEach((f, i) => {
            playTone(f, 'sine', now + (i * 0.15), 4.0, 0.2);
        });
    } else if (type === 'completed') {
        // Sparkly Ascending Completion Chime (4.0 Seconds)
        const freqs = [440.00, 554.37, 659.25, 880.00]; // A4, C#5, E5, A5 (Bright A Major)
        freqs.forEach((f, i) => {
            playTone(f, 'triangle', now + (i * 0.1), 4.0, 0.2); // Base body
            playTone(f * 2, 'sine', now + (i * 0.1), 4.0, 0.05); // Magical overtones
        });
    }
}

// ==========================================
// 2. CANVAS SETUP
// ==========================================
const roadCanvas = document.getElementById("roadCanvas");
const ctx = roadCanvas.getContext("2d");

const radarCanvas = document.getElementById("radarCanvas");
const rctx = radarCanvas.getContext("2d");

const diagCanvas = document.getElementById("diagnosticCanvas");
const dctx = diagCanvas ? diagCanvas.getContext("2d") : null;

function resizeCanvases() {
    roadCanvas.width = document.getElementById("simArea").clientWidth;
    roadCanvas.height = document.getElementById("simArea").clientHeight;

    let radarRect = document.getElementById("radarCanvas").parentElement.getBoundingClientRect();
    radarCanvas.width = radarRect.width - 30; // padding offset
    radarCanvas.height = 200;
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();

// ==========================================
// 3. UTILITIES & MATH
// ==========================================
function randomId() {
    const states = ["DL", "HR", "PB", "MH", "KA"];
    return states[Math.floor(Math.random() * states.length)] + " " + Math.floor(1000 + Math.random() * 8999);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function dist(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Parametric Mountain Road
function getPathPoint(t) {
    const w = roadCanvas.width;
    const h = roadCanvas.height;
    let x = w * t;
    let y = h / 2 + Math.sin(t * Math.PI * 3) * (h * 0.3) + Math.sin(t * Math.PI * 6) * (h * 0.1);
    return { x, y };
}

function getPathAngle(t) {
    let p1 = getPathPoint(t);
    let p2 = getPathPoint(t + 0.001);
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

// ==========================================
// 4. UI CONTROLLER (Analytics & Narration)
// ==========================================
class UIController {
    static init() {
        document.getElementById("dayNightToggle").addEventListener("change", (e) => {
            Config.dayNight = e.target.checked ? 'night' : 'day';
            UIController.log(`Environment globally shifted to ${Config.dayNight.toUpperCase()} mode.`);
        });

        document.getElementById("fogSlider").addEventListener("input", (e) => {
            Config.fogDensity = parseInt(e.target.value);
            document.getElementById("fogVal").innerText = Config.fogDensity;
        });

        document.getElementById("rainSlider").addEventListener("input", (e) => {
            Config.rainIntensity = parseInt(e.target.value);
            document.getElementById("rainVal").innerText = Config.rainIntensity;
        });

        document.getElementById("trafficSlider").addEventListener("input", (e) => {
            Config.trafficDensity = parseInt(e.target.value);
            document.getElementById("trafficVal").innerText = Config.trafficDensity;
            VehicleManager.adjustTraffic();
        });
    }

    static updateAnalytics(stats) {
        if(document.getElementById('activeEmg')) document.getElementById('activeEmg').innerText = stats.activeEmergencies;
        if(document.getElementById('successRate')) document.getElementById('successRate').innerText = stats.successRate;
    }

    static updateLiveNetwork() {
        if (Math.random() < 0.15 && document.getElementById('uplinkData')) {
            let baseData = 5.0 + (Config.trafficDensity * 0.5);
            let uplink = (baseData + Math.random() * 12.5).toFixed(2);
            let latency = Math.floor(12 + Math.random() * 30 - (Config.trafficDensity));
            if(latency < 4) latency = 4;
            
            document.getElementById('uplinkData').innerText = uplink;
            document.getElementById('meshLatency').innerText = latency;
            
            // Add slight warning color if latency high
            document.getElementById('meshLatency').style.color = latency > 35 ? "#ffaa00" : "#fff";
        }
    }

    static log(msg, type = 'log-success') {
        const logList = document.getElementById("logList");
        const div = document.createElement("div");
        div.className = type;
        const time = new Date().toLocaleTimeString();
        div.innerText = `[${time}] ${msg}`;
        logList.appendChild(div);
        logList.scrollTop = logList.scrollHeight;
    }

    static narrate(msg) {
        const overlay = document.getElementById("narrationOverlay");
        const text = overlay.querySelector(".narrationText");

        text.innerText = msg;
        overlay.classList.remove("hidden");
        overlay.style.opacity = 1;

        if (this.narrationTimeout) clearTimeout(this.narrationTimeout);
        this.narrationTimeout = setTimeout(() => {
            overlay.style.opacity = 0;
            setTimeout(() => overlay.classList.add("hidden"), 300);
        }, 4000);
    }
}

// Timeline Management
class Timeline {
    static reset() {
        document.getElementById("timelineProgress").innerHTML = `<div class="timeline-empty">Monitoring...</div>`;
    }
    static addStep(text, active = true) {
        const container = document.getElementById("timelineProgress");
        if (container.querySelector(".timeline-empty")) container.innerHTML = "";

        container.querySelectorAll(".timeline-item").forEach(item => {
            item.classList.remove("active");
            item.classList.add("done");
        });

        container.innerHTML += `
            <div class="timeline-item ${active ? 'active' : ''}">
                <div class="timeline-dot"></div>
                <span>${text}</span>
            </div>
        `;
    }
}

// ==========================================
// 5. COMMUNICATION SYSTEM (Decentralized)
// ==========================================
class CommunicationSystem {
    constructor() {
        this.packets = [];
    }

    broadcast(senderVehicle, type, rangeLimit = 300) {
        this.packets.push({
            x: senderVehicle.pos.x,
            y: senderVehicle.pos.y,
            radius: 0,
            maxRadius: rangeLimit,
            type: type,
            alpha: 1,
            color: type === 'EMERGENCY' ? '255, 51, 51' : '0, 240, 255'
        });

        UIController.log(`Broadcast: ${type} sent by ${senderVehicle.id} (Range: ${rangeLimit}m)`);
        UIController.narrate(`“Broadcasting ${type} signal...”`);

        return new Promise((resolve) => {
            setTimeout(() => {
                let responses = [];
                let relayTriggered = RSU.checkRelay(senderVehicle.pos, rangeLimit);

                VehicleManager.vehicles.forEach(v => {
                    if (v === senderVehicle || v.state === Config.states.BROKEN) return;
                    let d = dist(v.pos, senderVehicle.pos);
                    // If relay triggered, map-wide reception regardless of distance
                    if (d <= rangeLimit || relayTriggered) {
                        responses.push(v);
                    }
                });
                resolve(responses);
            }, 1000 / Config.simSpeed);
        });
    }

    updateAndDraw(ctx) {
        for (let i = this.packets.length - 1; i >= 0; i--) {
            let p = this.packets[i];
            p.radius += 3 * Config.simSpeed;
            p.alpha = 1 - (p.radius / p.maxRadius);

            if (p.radius >= p.maxRadius || p.alpha <= 0) {
                this.packets.splice(i, 1);
                continue;
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${p.color}, ${Math.max(0, p.alpha)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}
const Comms = new CommunicationSystem();

// ==========================================
// 5.5 V2I RSU (Roadside Units) MANAGER
// ==========================================
class RSUManager {
    constructor() {
        this.towers = [0.15, 0.5, 0.85]; // Fractional coordinates along the path
    }

    checkRelay(originPos, rangeLimit) {
        for (let t of this.towers) {
            let p = getPathPoint(t);
            // If the broadcast hits the tower
            if (dist(originPos, p) <= rangeLimit) {
                UIController.log("📡 RSU Tower intercepted signal! Relaying map-wide...", "log-success");
                return true;
            }
        }
        return false;
    }

    draw(ctx) {
        this.towers.forEach(t => {
            let p = getPathPoint(t);
            // Draw a futuristic tower
            ctx.fillStyle = "#223";
            ctx.fillRect(p.x - 5, p.y + 40, 10, -60); // base

            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 20);
            ctx.lineTo(p.x - 15, p.y - 40);
            ctx.lineTo(p.x + 15, p.y - 40);
            ctx.fillStyle = "#112";
            ctx.fill();

            // Blinking red beacon light at top
            if (Math.floor(Date.now() / 800) % 2 === 0) {
                ctx.fillStyle = "#ff3333";
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#ff3333";
                ctx.beginPath();
                ctx.arc(p.x, p.y - 45, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        });
    }
}
const RSU = new RSUManager();

// ==========================================
// 6. EMERGENCY MANAGER & DRONES
// ==========================================
class Drone {
    constructor(targetEntity, onArrive) {
        this.pos = { x: 0, y: roadCanvas.height }; // Starts at bottom left
        this.target = targetEntity;
        this.active = true;
        this.speed = 3;
        this.onArrive = onArrive;
        this.state = 'flying';
    }
    updateAndDraw(ctx) {
        if (!this.active) return;

        let d = dist(this.pos, this.target.pos);
        if (this.state === 'flying') {
            let angle = Math.atan2(this.target.pos.y - this.pos.y, this.target.pos.x - this.pos.x);
            this.pos.x += Math.cos(angle) * this.speed * Config.simSpeed;
            this.pos.y += Math.sin(angle) * this.speed * Config.simSpeed;

            if (d < 5) {
                this.state = 'helping';
                if (this.onArrive) this.onArrive();
            }
        } else if (this.state === 'helping') {
            this.pos.x = this.target.pos.x;
            this.pos.y = this.target.pos.y - 40; // hover above

            // Draw Scanning spotlight
            ctx.beginPath();
            ctx.moveTo(this.pos.x, this.pos.y);
            ctx.lineTo(this.pos.x - 40, this.pos.y + 120);
            ctx.lineTo(this.pos.x + 40, this.pos.y + 120);
            let grad = ctx.createLinearGradient(this.pos.x, this.pos.y, this.pos.x, this.pos.y + 120);
            grad.addColorStop(0, "rgba(0, 240, 255, 0.7)");
            grad.addColorStop(1, "rgba(0, 240, 255, 0)");
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // Draw Drone Body
        ctx.fillStyle = "#fff";
        ctx.fillRect(this.pos.x - 12, this.pos.y - 3, 24, 6);
        ctx.fillStyle = "#ff3333"; // rotors
        ctx.beginPath();
        let rotorOffset = (Date.now() / 50) % 4; // visual spin
        ctx.arc(this.pos.x - 12, this.pos.y - 3, 4 + rotorOffset, 0, Math.PI * 2);
        ctx.arc(this.pos.x + 12, this.pos.y - 3, 4 + rotorOffset, 0, Math.PI * 2);
        ctx.fill();
    }
}

class EmergencyManager {
    constructor() {
        this.activeEmgs = [];
        this.totalEmgs = 0;
        this.resolvedEmgs = 0;
        this.startTime = Date.now();
        this.activeDrones = [];
    }

    async triggerEmergency(vehicle, emgType, driverCondition, simulateNoHelp = false) {
        if (vehicle.state === Config.states.BROKEN) return;

        this.totalEmgs++;
        this.activeEmgs.push(vehicle);
        this.updateStats();

        let startTime = Date.now();
        vehicle.state = Config.states.BROKEN;
        vehicle.targetSpeed = 0;
        vehicle.speed = 0;
        vehicle.laneOffset = -20; // pull over

        Timeline.addStep("Request Sent: " + emgType.toUpperCase());
        UIController.narrate(`“Emergency DETECTED on ${vehicle.id}. Issue: ${driverCondition}”`);
        UIController.log(`Sys Warning: ${vehicle.id} broke down (${emgType})`, 'log-error');
        playSound('requesting');

        await new Promise(r => setTimeout(r, 1000 / Config.simSpeed));

        Timeline.addStep("Broadcasting...");

        let range = simulateNoHelp ? 50 : 300;
        let responders = await Comms.broadcast(vehicle, 'EMERGENCY', range);

        Timeline.addStep("Vehicles Evaluating...");
        UIController.narrate(`“Evaluating optimal responders...”`);

        if (simulateNoHelp || responders.length === 0) {
            UIController.log(`No direct responders found. Multi-hop required!`, 'log-warn');
            UIController.narrate(`“Direct signal failed! Initiating Multi-Hop...”`);
            await new Promise(r => setTimeout(r, 1500 / Config.simSpeed));
            let newResponders = await Comms.broadcast(vehicle, 'MULTI_HOP_SOS', 800);
            responders = newResponders;
        }

        let bestResponder = null;
        if (responders.length > 0) {
            let sortedResponders = responders.map(r => {
                let d = dist(r.pos, vehicle.pos);
                let score = 1000 - d;
                if (emgType === 'medical' && r.type === Config.types.MEDICAL) score += 2000;
                if (emgType === 'breakdown' && r.type === Config.types.MECHANIC) score += 2000;
                return { responder: r, score: score };
            }).sort((a, b) => b.score - a.score).map(x => x.responder);

            for (let candidate of sortedResponders) {
                Timeline.addStep("Prompting " + candidate.id);
                UIController.narrate(`“Ping sent to ${candidate.id}. Awaiting response...”`);

                let accepted = await this.promptResponder(candidate, vehicle);
                if (accepted) {
                    bestResponder = candidate;
                    break;
                } else {
                    UIController.log(`${candidate.id} rejected the request. Finding next.`, 'log-warn');
                }
            }
        }

        if (!bestResponder) {
            Timeline.addStep("Drone Fallback Dispatch", true);
            UIController.narrate(`“All capable units rejected the call. Summoning V2X Emergency UAV.”`);
            UIController.log(`Drone dispatched for ${vehicle.id}`, 'log-warn');

            let drone = new Drone(vehicle, () => {
                Timeline.addStep("UAV Arrived & Assisting");
                UIController.narrate(`“UAV has arrived. Commencing diagnostics and repair.”`);
                playSound('arrived');

                setTimeout(() => {
                    drone.active = false;
                    this.activeDrones = this.activeDrones.filter(d => d !== drone);
                    this.resolveEmergency(null, vehicle, startTime);
                }, 15000 / Config.simSpeed);
            });
            this.activeDrones.push(drone);
            this.updateStats();
            return;
        }

        Timeline.addStep("Responder Selected");
        bestResponder.state = Config.states.RESPONDER;
        bestResponder.targetEntity = vehicle;

        UIController.log(`Dispatcher: Assigned ${bestResponder.id} to ${vehicle.id}`);
        UIController.narrate(`“Dispatching ${bestResponder.type.toUpperCase()} assistance...”`);

        this.createCorridor(vehicle);
        this.monitorArrival(bestResponder, vehicle, startTime);
    }

    async promptResponder(responder, broken) {
        return new Promise(resolve => {
            responder.targetedForRequest = true;
            document.getElementById("reqTargetId").innerText = broken.id;
            document.getElementById("reqDistance").innerText = Math.round(dist(responder.pos, broken.pos));
            document.getElementById("responderPopup").classList.remove("hidden");

            let oldSpeed = Config.simSpeed;
            Config.simSpeed = 0;

            window.responderResolver = (accepted) => {
                Config.simSpeed = oldSpeed;
                resolve(accepted);
            };
        });
    }

    createCorridor(targetVeh) {
        VehicleManager.vehicles.forEach(v => {
            if (v.state === Config.states.NORMAL && dist(v.pos, targetVeh.pos) < 200) {
                v.targetSpeed = v.baseSpeed * 0.3;
                v.laneOffset = 15;
            }
        });
    }

    monitorArrival(responder, broken, startTime) {
        let check = setInterval(() => {
            if (dist(responder.pos, broken.pos) < 30) {
                clearInterval(check);
                responder.speed = 0;
                responder.targetSpeed = 0;
                responder.state = Config.states.HELPING;

                Timeline.addStep("Arrived & Assisting");
                UIController.narrate(`“Help has arrived. Commencing assistance.”`);
                UIController.log(`Assistance in progress for ${broken.id}`);
                playSound('arrived');

                responder.laneOffset = -20;

                setTimeout(() => {
                    this.resolveEmergency(responder, broken, startTime);
                }, 15000 / Config.simSpeed);
            }
        }, 100);
    }

    resolveEmergency(responder, broken, startTime) {
        broken.state = Config.states.NORMAL;
        broken.speed = broken.baseSpeed;
        broken.laneOffset = 0;

        if (responder) {
            responder.state = Config.states.NORMAL;
            responder.targetEntity = null;
            responder.laneOffset = 0;
        }

        VehicleManager.vehicles.forEach(v => {
            if (v.laneOffset !== 0 && v !== broken && v !== responder) v.laneOffset = 0;
        });

        this.resolvedEmgs++;
        this.activeEmgs = this.activeEmgs.filter(v => v !== broken);

        UIController.narrate(`“Incident fully resolved. Traffic restored.”`);
        Timeline.addStep("Resolved");
        playSound('completed');
        setTimeout(() => Timeline.reset(), 3000);

        this.updateStats(startTime);
    }

    updateStats(startTime = null) {
        let rate = this.totalEmgs === 0 ? 100 : Math.round((this.resolvedEmgs / this.totalEmgs) * 100);
        let duration = startTime ? (Date.now() - startTime) / 1000 : 0;

        UIController.updateAnalytics({
            avgResponse: duration || 0,
            activeEmergencies: this.activeEmgs.length,
            activeDrones: this.activeDrones.length,
            successRate: rate
        });
    }
}
const EmgManager = new EmergencyManager();

// ==========================================
// 7. VEHICLE, PLATOONING, MANAGER LOGIC
// ==========================================
class Vehicle {
    constructor() {
        this.id = randomId();
        this.t = Math.random();

        let r = Math.random();
        this.type = r > 0.8 ? Config.types.MECHANIC : (r > 0.6 ? Config.types.MEDICAL : Config.types.NORMAL);

        this.baseSpeed = 0.0004 + (Math.random() * 0.0002);
        this.speed = this.baseSpeed;
        this.targetSpeed = this.baseSpeed;

        this.fuel = 100;
        this.state = Config.states.NORMAL;

        this.pos = getPathPoint(this.t);
        this.angle = getPathAngle(this.t);
        this.laneOffset = 0;
        this.targetLaneOffset = 0;
        this.overtakeTimer = 0;
        this.targetedForRequest = false;
        this.platoonPartner = null; // Cooperative convoy Link

        this.prevSpeeds = [this.speed];
    }

    update() {
        if (this.state === Config.states.BROKEN || this.state === Config.states.HELPING) {
            this.speed = 0;
            return;
        }

        let inZone = false;
        let targetZoneDrop = 1;
        Config.terrainZones.forEach(z => {
            if (this.t >= z.start && this.t <= z.end) {
                targetZoneDrop = z.rSpeedDrop;
                inZone = true;
            }
        });

        // Global rain penalty
        let weatherDrop = Config.rainIntensity > 0 ? (1 - (Config.rainIntensity / 200)) : 1; // max 50% drop

        if (this.state === Config.states.NORMAL) {
            this.targetSpeed = this.baseSpeed * targetZoneDrop * weatherDrop;
        }

        if (this.state === Config.states.RESPONDER && this.targetEntity) {
            this.targetSpeed = this.baseSpeed * 1.5 * weatherDrop;
        }
        // Phase 1: Moses Effect (Emergency Preemption)
        let isPreempted = false;
        if (this.state === Config.states.NORMAL) {
            VehicleManager.vehicles.forEach(v => {
                if (v.state === Config.states.RESPONDER && dist(this.pos, v.pos) < 250) {
                    let d = this.tDist(v.t, this.t);
                    if (d > 0.01 && d < 0.1) isPreempted = true; // Responder is screaming up behind us!
                }
            });
        }

        if (isPreempted) {
            this.targetLaneOffset = 30; // Swerve completely into the shoulder
            this.overtakeTimer = 50; // Pin it there dynamically
        } else if(this.overtakeTimer > 0) {
            this.overtakeTimer -= Config.simSpeed;
            if (this.targetLaneOffset !== 30) this.targetLaneOffset = -22; // Sweep aggressively to passing lane
        } else {
            this.targetLaneOffset = 0;   // Natural lane center
        }

        // Collision Avoidance & Platooning
        let vehicleAhead = this.getVehicleAhead();
        this.platoonPartner = null;

        if (vehicleAhead) {
            let distToAhead = this.tDist(vehicleAhead.t, this.t);
            // Collision avoidance & Overtaking Trigger
            if (distToAhead < 0.038) {
                if (vehicleAhead.speed === 0 || vehicleAhead.state === Config.states.HELPING || vehicleAhead.state === Config.states.BROKEN) {
                    this.overtakeTimer = 200; // Force Overtake Maneuver (~3 seconds)
                } else if (vehicleAhead.speed < this.speed) {
                    this.targetSpeed = vehicleAhead.speed;
                }
            }

            // Platooning Trigger (Convoy Mode)
            if (this.state === Config.states.NORMAL && vehicleAhead.state === Config.states.NORMAL) {
                if (distToAhead < 0.04 && distToAhead > 0.02 && dist(this.pos, vehicleAhead.pos) < 200 && this.overtakeTimer <= 0) {
                    this.targetSpeed = vehicleAhead.speed; // Sync speed entirely
                    this.platoonPartner = vehicleAhead;    // Establish visual link
                }
            }
        }

        // Diagnostic History Tracker
        this.prevSpeeds.push(this.speed);
        if (this.prevSpeeds.length > 100) this.prevSpeeds.shift();

        this.speed = lerp(this.speed, this.targetSpeed, 0.05 * Config.simSpeed);
        this.laneOffset = lerp(this.laneOffset, this.targetLaneOffset, 0.04 * Config.simSpeed);

        this.t += this.speed * Config.simSpeed;
        if (this.t > 1) {
            this.t = 0;
            this.fuel = 100;
        }

        this.pos = getPathPoint(this.t);

        if (this.laneOffset !== 0) {
            let a = getPathAngle(this.t) + Math.PI / 2;
            this.pos.x += Math.cos(a) * this.laneOffset;
            this.pos.y += Math.sin(a) * this.laneOffset;
        }

        this.angle = getPathAngle(this.t);
    }

    tDist(tAhead, tBehind) {
        if (tAhead > tBehind) return tAhead - tBehind;
        return (1 - tBehind) + tAhead;
    }

    getVehicleAhead() {
        let ahead = null;
        let minDist = 1;
        VehicleManager.vehicles.forEach(v => {
            if (v === this) return;
            if (this.overtakeTimer > 0) return; // Ignore vehicles holding up lane while overtaking
            if (Math.abs(this.laneOffset - v.laneOffset) > 10) return;
            let d = this.tDist(v.t, this.t);
            if (d > 0 && d < minDist) {
                minDist = d;
                ahead = v;
            }
        });
        return ahead;
    }

    getColor() {
        if (this.state === Config.states.BROKEN) return "#ff3333";
        if (this.state === Config.states.RESPONDER) return "#00ff00";
        if (this.state === Config.states.HELPING) return "#00aaee";
        if (this.type === Config.types.MECHANIC) return "#ffaa00";
        if (this.type === Config.types.MEDICAL) return "#ff99e6";
        return "#ffffff";
    }

    draw(ctx) {
        // Phase 2: Ghost Trajectories (Predictive Paths)
        if (this.speed > 0 && this.state !== Config.states.BROKEN) {
            ctx.beginPath();
            for(let i=0; i<15; i++) {
                let futureT = this.t + (i * this.speed * 2);
                if(futureT > 1) futureT -= 1;
                let ftP = getPathPoint(futureT);
                
                let ptAngle = getPathAngle(futureT);
                let nx = ftP.x + Math.cos(ptAngle - Math.PI/2) * this.laneOffset;
                let ny = ftP.y + Math.sin(ptAngle - Math.PI/2) * this.laneOffset;

                if (i===0) ctx.moveTo(nx, ny);
                else ctx.lineTo(nx, ny);
            }
            ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw Platooning Shield
        if (this.platoonPartner) {
            ctx.beginPath();
            ctx.moveTo(this.pos.x, this.pos.y);
            ctx.lineTo(this.platoonPartner.pos.x, this.platoonPartner.pos.y);
            ctx.strokeStyle = "rgba(0, 240, 255, 0.5)";
            ctx.lineWidth = 15;
            ctx.lineCap = "round";
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle);

        let blink = false;
        if ((this.state === Config.states.BROKEN || this.state === Config.states.RESPONDER) && Math.floor(Date.now() / 200) % 2 === 0) {
            blink = true;
        }

        if (blink) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.getColor();
        }

        ctx.fillStyle = this.getColor();
        if (this.type === Config.types.NORMAL) {
            // Sleek aerodynamic sportscar
            ctx.beginPath();
            ctx.moveTo(-10, -5); ctx.lineTo(6, -4);
            ctx.lineTo(12, 0); ctx.lineTo(6, 4);
            ctx.lineTo(-10, 5); ctx.closePath();
            ctx.fill();
        } else if (this.type === Config.types.MECHANIC) {
            // Boxy robust tow truck flatbed
            ctx.fillRect(-12, -6, 18, 12);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(4, -5, 6, 10); // White cabin
        } else if (this.type === Config.types.MEDICAL) {
            // Ambulance van with vivid red cross
            ctx.fillRect(-10, -6, 20, 12);
            ctx.fillStyle = "#ff0000";
            ctx.fillRect(-2, -4, 4, 8);
            ctx.fillRect(-4, -2, 8, 4);
        }

        // Phase 3: Adaptive Headlights (Twilight and Night)
        let ambientLight = Math.max(0, Math.sin((Config.timeOfDay / 2400) * Math.PI)); 
        if (ambientLight < 0.6 && this.speed > 0) {
            ctx.beginPath();
            ctx.moveTo(8, -4);
            ctx.lineTo(150, -40);
            ctx.lineTo(150, 40);
            ctx.lineTo(8, 4);
            let grad = ctx.createLinearGradient(8, 0, 150, 0);
            let alpha = Math.min(0.8, (0.6 - ambientLight) * 2.5);
            grad.addColorStop(0, `rgba(255, 255, 200, ${alpha})`);
            grad.addColorStop(1, 'rgba(255, 255, 200, 0)');
            ctx.fillStyle = grad;
            ctx.fill();
        }

        if (this.targetedForRequest) {
            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.strokeStyle = "#00f0ff";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (Config.dayNight === 'night') {
            ctx.beginPath();
            ctx.moveTo(8, -4);
            ctx.lineTo(80, -25);
            ctx.lineTo(80, 25);
            ctx.lineTo(8, 4);
            let grad = ctx.createLinearGradient(8, 0, 80, 0);
            grad.addColorStop(0, 'rgba(255, 255, 200, 0.6)');
            grad.addColorStop(1, 'rgba(255, 255, 200, 0)');
            ctx.fillStyle = grad;
            ctx.shadowBlur = 0;
            ctx.fill();
        }

        ctx.restore();

        ctx.fillStyle = this.getColor();
        ctx.font = "10px sans-serif";
        ctx.fillText(this.id, this.pos.x - 15, this.pos.y - 15);
    }
}

class SystemVehicleManager {
    constructor() {
        this.vehicles = [];
    }
    adjustTraffic() {
        let diff = Config.trafficDensity - this.vehicles.length;
        if (diff > 0) {
            for (let i = 0; i < diff; i++) this.vehicles.push(new Vehicle());
        } else if (diff < 0) {
            let nV = this.vehicles.filter(v => v.state === Config.states.NORMAL);
            for (let i = 0; i < Math.abs(diff) && nV.length > 0; i++) {
                let toKill = nV.pop();
                this.vehicles = this.vehicles.filter(v => v !== toKill);
            }
        }
    }
    updateAndDraw(ctx) {
        this.vehicles.forEach(v => v.update());
        this.vehicles.sort((a, b) => a.pos.y - b.pos.y).forEach(v => v.draw(ctx));
    }
}
const VehicleManager = new SystemVehicleManager();

// ==========================================
// 8. RADAR SYSTEM
// ==========================================
class Radar {
    constructor() {
        this.sweepAngle = 0;
    }
    updateAndDraw(ctx, canvas) {
        let w = canvas.width;
        let h = canvas.height;
        let cx = w / 2;
        let cy = h / 2;

        ctx.fillStyle = "rgba(2, 5, 10, 0.1)";
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "rgba(0, 240, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < h; i += 40) { ctx.moveTo(0, i); ctx.lineTo(w, i); }
        for (let i = 0; i < w; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, h); }
        ctx.stroke();

        ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();

        this.sweepAngle += 0.05 * Config.simSpeed;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.sweepAngle);

        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
        ctx.strokeStyle = "#00f0ff"; ctx.stroke();

        let grad = ctx.createLinearGradient(0, 0, 0, 50);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 150, 0, -0.6, true);
        ctx.fillStyle = "rgba(0, 240, 255, 0.4)"; ctx.fill();
        ctx.restore();

        VehicleManager.vehicles.forEach(v => {
            let rx = (v.pos.x / roadCanvas.width) * w;
            let ry = (v.pos.y / roadCanvas.height) * h;
            rx = Math.max(5, Math.min(w - 5, rx));
            ry = Math.max(5, Math.min(h - 5, ry));

            ctx.beginPath();
            ctx.arc(rx, ry, 3, 0, Math.PI * 2);
            ctx.fillStyle = v.getColor();
            ctx.shadowBlur = 5;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }
}
const RadarSys = new Radar();

// ==========================================
// 8.5 MESH TOPOLOGY VISUALIZER
// ==========================================
function drawMeshTopology(ctx) {
    let vehs = VehicleManager.vehicles;
    for (let i = 0; i < vehs.length; i++) {
        for (let j = i + 1; j < vehs.length; j++) {
            let d = dist(vehs[i].pos, vehs[j].pos);
            if (d < 250) { // Comm range
                ctx.beginPath();
                ctx.moveTo(vehs[i].pos.x, vehs[i].pos.y);
                ctx.lineTo(vehs[j].pos.x, vehs[j].pos.y);
                let alpha = 1 - (d / 250);
                let isEmergency = (vehs[i].state === Config.states.BROKEN || vehs[j].state === Config.states.BROKEN);
                // Draw connecting laser tethers
                ctx.strokeStyle = isEmergency ? `rgba(255, 51, 51, ${alpha * 0.8})` : `rgba(0, 240, 255, ${alpha * 0.3})`;
                ctx.lineWidth = isEmergency ? 2 : 1;
                ctx.stroke();
            }
        }
    }
}

// ==========================================
// 8.6 DIAGNOSTIC DASHBOARD GRAPH
// ==========================================
function drawDiagnosticGraph() {
    if (!dctx || !selectedVehicle) return;
    let w = diagCanvas.width;
    let h = diagCanvas.height;

    dctx.fillStyle = "#02050a";
    dctx.fillRect(0, 0, w, h);

    let history = selectedVehicle.prevSpeeds;
    if (history.length === 0) return;

    dctx.beginPath();
    dctx.strokeStyle = selectedVehicle.state === Config.states.BROKEN ? "#ff3333" : "#00f0ff";
    dctx.lineWidth = 2;

    for (let i = 0; i < history.length; i++) {
        let x = (i / 100) * w;
        // Normalize speed rendering (base max roughly 0.0006)
        let speedNorm = history[i] / 0.0007;
        let y = h - (speedNorm * h * 0.8) - 10;

        // Critical erratic spikes when broken
        if (selectedVehicle.state === Config.states.BROKEN) y += (Math.random() * 40 - 20);

        if (i === 0) dctx.moveTo(x, y);
        else dctx.lineTo(x, y);
    }
    dctx.stroke();

    dctx.fillStyle = "#fff";
    dctx.font = "12px sans-serif";
    dctx.fillText("Real-time V2X Heartbeat (Speed & Health)", 5, 15);
}

// ==========================================
// 9. DRAW ENVIRONMENT, PATH & WEATHER
// ==========================================
let lightningTimer = 0;
function drawEnvironment(ctx) {
    ctx.clearRect(0, 0, roadCanvas.width, roadCanvas.height);

    // Phase 3: Dynamic Sky Transition
    let ambientLight = Math.max(0, Math.sin((Config.timeOfDay / 2400) * Math.PI)); 
    let darknessOverlay = 1 - ambientLight;
    
    if (darknessOverlay > 0) {
        ctx.fillStyle = `rgba(0, 5, 20, ${darknessOverlay * 0.95})`;
        ctx.fillRect(0, 0, roadCanvas.width, roadCanvas.height);
    }

    // Terrain Zones
    Config.terrainZones.forEach(z => {
        ctx.beginPath();
        for (let t = z.start; t <= z.end; t += 0.01) {
            let p = getPathPoint(t);
            if (t === z.start) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 120;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
    });

    // Road Base
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.005) {
        let p = getPathPoint(t);
        if (t === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 40;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Lane Markings
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.01) {
        let p = getPathPoint(t);
        if (t === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 15]);
    ctx.stroke();
    ctx.setLineDash([]);

    drawMeshTopology(ctx);

    // Weather Engine: Fog
    if (Config.fogDensity > 0) {
        let intensity = Config.fogDensity / 100;
        ctx.fillStyle = `rgba(180, 190, 200, ${intensity * 0.7})`;
        ctx.fillRect(0, 0, roadCanvas.width, roadCanvas.height);

        let time = Date.now() / 2000;
        for (let i = 0; i < 3; i++) {
            let cx = (Math.sin(time + i) * roadCanvas.width / 2) + roadCanvas.width / 2;
            let cy = (Math.cos(time * 1.5 + i) * roadCanvas.height / 2) + roadCanvas.height / 2;
            let rad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300);
            rad.addColorStop(0, `rgba(220, 220, 220, ${intensity * 0.4})`);
            rad.addColorStop(1, 'rgba(220, 220, 220, 0)');
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, roadCanvas.width, roadCanvas.height);
        }
    }

    // Weather Engine: Fast Rain Particle Lines
    if (Config.rainIntensity > 0) {
        let intensity = Config.rainIntensity;
        ctx.strokeStyle = `rgba(200, 220, 255, ${intensity / 100 * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let numDrops = intensity * 10;
        for (let i = 0; i < numDrops; i++) {
            let x = Math.random() * roadCanvas.width;
            let y = Math.random() * roadCanvas.height;
            let length = 30 * (intensity / 50);
            ctx.moveTo(x, y);
            ctx.lineTo(x - length / 2, y + length); // Angled falling rain
        }
        ctx.stroke();

        // Random Lightning Strikes
        if (Math.random() < (intensity / 10000)) {
            lightningTimer = 8;
        }
    }

    // Draw Lightning Bleed overlay
    if (lightningTimer > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${lightningTimer / 10})`;
        ctx.fillRect(0, 0, roadCanvas.width, roadCanvas.height);
        lightningTimer--;
    }
}

// ==========================================
// 10. MAIN LOOP
// ==========================================
function engineLoop() {
    // Phase 3: Diurnal Cycle
    Config.timeOfDay += 0.5 * Config.simSpeed;
    if (Config.timeOfDay > 2400) Config.timeOfDay = 0;

    // Phase 4: Cyber Deck Live Data
    UIController.updateLiveNetwork();

    drawEnvironment(ctx);

    RSU.draw(ctx);
    Comms.updateAndDraw(ctx);
    VehicleManager.updateAndDraw(ctx);

    EmgManager.activeDrones.forEach(d => d.updateAndDraw(ctx));

    RadarSys.updateAndDraw(rctx, radarCanvas);
    drawDiagnosticGraph();

    requestAnimationFrame(engineLoop);
}

// ==========================================
// 11. USER INTERACTION & DEMO HOOKS
// ==========================================
roadCanvas.addEventListener("click", (e) => {
    let rect = roadCanvas.getBoundingClientRect();
    let cx = e.clientX - rect.left;
    let cy = e.clientY - rect.top;

    let closest = null;
    let minD = Infinity;

    VehicleManager.vehicles.forEach(v => {
        let d = dist({ x: cx, y: cy }, v.pos);
        if (d < 30 && d < minD) {
            minD = d;
            closest = v;
        }
    });

    if (closest) {
        window.openEmergencyPopup(closest);
    }
});

let selectedVehicle = null;

window.openEmergencyPopup = function (vehicle) {
    selectedVehicle = vehicle;
    window.openSOSWizard(vehicle); // Reroute to the new Wizard
};

window.resolveResponderPrompt = function (accepted) {
    if (window.responderResolver) {
        window.responderResolver(accepted);
        window.responderResolver = null;
    }
    document.getElementById("responderPopup").classList.add("hidden");
    VehicleManager.vehicles.forEach(v => v.targetedForRequest = false);
};

window.triggerDemo = function (scenario) {
    let normals = VehicleManager.vehicles.filter(v => v.state === Config.states.NORMAL);
    if (normals.length === 0) return alert("Wait for traffic to normalize!");
    let target = normals[Math.floor(Math.random() * normals.length)];

    if (scenario === 'breakdown') {
        EmgManager.triggerEmergency(target, 'breakdown', 'conscious');
    } else if (scenario === 'medical') {
        EmgManager.triggerEmergency(target, 'medical', 'critical');
    } else if (scenario === 'no_help') {
        EmgManager.triggerEmergency(target, 'breakdown', 'injured', true);
    }
};

window.setSpeed = function (val) {
    Config.simSpeed = val;
    document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.innerText.includes(val)) btn.classList.add("active");
    });
};

// ==========================================
// INITIALIZATION
// ==========================================
window.onload = () => {
    UIController.init();
    VehicleManager.adjustTraffic();
    Timeline.reset();
    engineLoop();
    UIController.log("System Initialization Complete. V2V Mesh Active.");
    UIController.narrate("“Next-Gen Features Online. Monitoring Traffic...”");
};

// ==========================================
// 12. SOS DISPATCH WIZARD LOGIC
// ==========================================
let sosWizardTarget = null;
let sosCategory = "";
let sosSpecific = "";

window.openSOSWizard = function (target = null) {
    sosWizardTarget = target;

    document.getElementById("wizardStep1").classList.remove("hidden");
    document.getElementById("wizardStep2").classList.add("hidden");
    document.getElementById("wizardStep3").classList.add("hidden");
    document.getElementById("wizardFinal").classList.add("hidden");

    document.getElementById("sosWizard").classList.remove("hidden");
    playSound('arrived');
};

window.closeSOSWizard = function () {
    document.getElementById("sosWizard").classList.add("hidden");
    sosWizardTarget = null;
};

window.selectWizardCategory = function (cat) {
    sosCategory = cat;
    document.getElementById("wizardStep1").classList.add("hidden");

    let subOptionsDiv = document.getElementById("wizardSubOptions");
    subOptionsDiv.innerHTML = "";

    let options = [];
    if (cat === "Mechanical Failure") {
        options = ["Engine Failure", "Flat Tire", "Battery Problem", "Other"];
    } else {
        options = ["Conscious", "Injured", "Critical", "Other"];
    }

    options.forEach(opt => {
        let btn = document.createElement("button");
        btn.className = "wizard-btn";
        btn.innerText = opt;
        btn.onclick = () => window.selectWizardSubCategory(opt);
        subOptionsDiv.appendChild(btn);
    });

    document.getElementById("wizardStep2Title").innerText = cat + " Details:";
    document.getElementById("wizardStep2").classList.remove("hidden");
};

window.selectWizardSubCategory = function (sub) {
    document.getElementById("wizardStep2").classList.add("hidden");

    if (sub === "Other") {
        document.getElementById("wizardCustomInput").value = "";
        document.getElementById("wizardStep3").classList.remove("hidden");
    } else {
        sosSpecific = sub;
        window.showWizardFinal();
    }
};

window.confirmWizardCustom = function () {
    let customVal = document.getElementById("wizardCustomInput").value.trim();
    if (!customVal) { return alert("Please type a specific issue!"); }
    sosSpecific = customVal;
    document.getElementById("wizardStep3").classList.add("hidden");
    window.showWizardFinal();
};

window.showWizardFinal = function () {
    document.getElementById("wizardStep2").classList.add("hidden");
    document.getElementById("wizardStep3").classList.add("hidden");

    let payloadString = `${sosCategory}: ${sosSpecific}`.toUpperCase();
    document.getElementById("wizardPayloadDisplay").innerText = `[PAYLOAD BUILD] => ${payloadString}`;

    document.getElementById("wizardFinal").classList.remove("hidden");
};

window.broadcastSOS = function () {
    let target = sosWizardTarget;
    if (!target) {
        let normals = VehicleManager.vehicles.filter(v => v.state === Config.states.NORMAL);
        if (normals.length === 0) return alert("Wait for traffic to normalize!");
        target = normals[Math.floor(Math.random() * normals.length)];
    }

    window.closeSOSWizard();

    let emgType = sosCategory === "Mechanical Failure" ? "breakdown" : "medical";

    // Inject custom payload string
    EmgManager.triggerEmergency(target, emgType, sosSpecific);
};
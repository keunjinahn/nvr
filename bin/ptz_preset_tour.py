# ptz_preset_tour.py
# 보기 좋은 다크톤 GUI + PNT 투어 모드(Flow #2) + 사이클 정규화/총 시간 제한 + 진행률 표시
# 표준 라이브러리만 사용

import socket
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox

# =========================
# PNT protocol helpers
# =========================
RMID = 0xB8  # 184
TMID = 0xAC  # 172
PNT_ID = 0x01  # 장치 Address는 내부 고정(비노출)

PID_PRESET_SAVE = 24    # 0x18
PID_PRESET_RECALL = 25  # 0x19
PID_TOUR = 46           # 0x2E (1 = start, 0 = stop)
PID_SET_EACH_TOUR_DATA = 222  # 0xDE: [D0=preset(1~8), D1~D2= speed(rpm LSB/MSB), D3=delay(1~255s)]

TOUR_SPEED_RPM_DEFAULT = 600
DELAY_1MIN_DEFAULT = 60
DELAY_57MIN_DEFAULT = 57 * 60  # 57분

def _chk_twos_complement(payload_bytes):
    total = sum(payload_bytes) & 0xFF
    return ((~total) + 1) & 0xFF

def _int_le16(n: int):
    n &= 0xFFFF
    return [n & 0xFF, (n >> 8) & 0xFF]

def build_pnt_packet(pid: int, data_bytes=None) -> bytes:
    data = list(data_bytes or [])
    base = [RMID, TMID, PNT_ID, pid, len(data)] + data
    chk = _chk_twos_complement(base)
    return bytes(base + [chk])

class PNTClient:
    def __init__(self):
        self.sock = None
        self.lock = threading.Lock()

    def connect(self, host: str, port: int):
        self.close()
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5.0)
        s.connect((host, port))
        s.settimeout(1.0)  # 읽기 타임아웃(선택)
        self.sock = s

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
        self.sock = None

    def send(self, pid: int, data_bytes=None) -> bytes:
        if not self.sock:
            raise RuntimeError("소켓이 연결되지 않았습니다.")
        pkt = build_pnt_packet(pid, data_bytes)
        with self.lock:
            self.sock.sendall(pkt)
        return pkt

    # --- High-level helpers ---
    def preset_save(self, num: int):   return self.send(PID_PRESET_SAVE,   [num & 0xFF])
    def preset_recall(self, num: int): return self.send(PID_PRESET_RECALL, [num & 0xFF])
    def tour_start(self):              return self.send(PID_TOUR,          [1])
    def tour_stop(self):               return self.send(PID_TOUR,          [0])

    def set_tour_step(self, preset_1_to_8: int, speed_rpm: int, delay_sec_1_to_255: int):
        if not (1 <= preset_1_to_8 <= 8):
            raise ValueError("preset must be 1..8")
        delay = max(1, min(255, int(delay_sec_1_to_255)))
        d1, d2 = _int_le16(int(speed_rpm))
        return self.send(PID_SET_EACH_TOUR_DATA, [preset_1_to_8 & 0xFF, d1, d2, delay])

# =========================
# Tkinter GUI (dark style)
# =========================
ACCENT = "#00d1b2"      # 포인트 컬러(민트)
DARK_BG = "#1f1f1f"
PANEL_BG = "#2b2b2b"
TEXT_FG = "#e6e6e6"
SUBTEXT_FG = "#bdbdbd"

class PTZApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PTZ Preset & Tour (PNT mode)")
        self.configure(bg=DARK_BG)
        self.geometry("1180x680")
        self.minsize(1050, 620)

        # ttk 스타일 통일
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure(".", background=PANEL_BG, foreground=TEXT_FG, fieldbackground="#3a3a3a")
        style.configure("Header.TLabel", background=DARK_BG, foreground=TEXT_FG, font=("맑은 고딕", 18, "bold"))
        style.configure("Sub.TLabel", background=DARK_BG, foreground=SUBTEXT_FG, font=("맑은 고딕", 10))
        style.configure("TButton", padding=8)
        style.map("TButton", background=[("active", "#3a3a3a")])
        style.configure("Card.TLabelframe", background=PANEL_BG, foreground=TEXT_FG, font=("맑은 고딕", 12, "bold"))
        style.configure("Card.TLabelframe.Label", background=PANEL_BG, foreground=TEXT_FG)
        style.configure("Accent.TButton", foreground="black")
        style.map("Accent.TButton", background=[("!disabled", ACCENT), ("active", "#12e0c2")])
        style.configure("Progress.Horizontal.TProgressbar", troughcolor="#3a3a3a", background=ACCENT)

        self.client = PNTClient()
        self.connected = False

        self.tour_thread = None
        self.tour_stop = threading.Event()

        # 진행률 표시용 상태
        self.cycle_target_sec = 0
        self.cycle_start_ts = 0.0

        # ===== Header bar =====
        header = tk.Frame(self, bg=DARK_BG)
        header.pack(fill="x", padx=20, pady=(14, 8))

        tk.Label(header, text="🎥  PTZ Preset & PNT Tour", font=("맑은 고딕", 20, "bold"),
                 fg=TEXT_FG, bg=DARK_BG).pack(side="left")

        # status LED
        self.led = tk.Canvas(header, width=16, height=16, bg=DARK_BG, highlightthickness=0)
        self.led.pack(side="left", padx=(10, 0))
        self._set_led("#888888")

        # spacer
        tk.Label(header, text="", bg=DARK_BG).pack(side="left", padx=12)

        # IP:PORT 입력 + 버튼
        self.ipport_var = tk.StringVar(value="192.168.0.50:8899")
        ip_entry = ttk.Entry(header, textvariable=self.ipport_var, width=26)
        ip_entry.pack(side="left")
        ttk.Button(header, text="연결/갱신", style="Accent.TButton", command=self.on_connect).pack(side="left", padx=8)
        self.btn_disconnect = ttk.Button(header, text="해제", command=self.on_disconnect, state="disabled")
        self.btn_disconnect.pack(side="left")

        # 우측 상단 서브텍스트
        tk.Label(header, text="ID는 내부 고정(1), Pelco가 아닌 PNT 모드", font=("맑은 고딕", 10),
                 fg=SUBTEXT_FG, bg=DARK_BG).pack(side="right")

        # ===== Main body: two columns =====
        body = tk.Frame(self, bg=DARK_BG)
        body.pack(fill="both", expand=True, padx=20, pady=10)

        left = tk.Frame(body, bg=DARK_BG)
        left.pack(side="left", fill="both", expand=True, padx=(0, 10))
        right = tk.Frame(body, bg=DARK_BG)
        right.pack(side="left", fill="both", expand=True, padx=(10, 0))

        # --- Left: Presets card ---
        lf_presets = ttk.Labelframe(left, text="프리셋", style="Card.TLabelframe")
        lf_presets.pack(fill="x", pady=6)

        grid = tk.Frame(lf_presets, bg=PANEL_BG)
        grid.pack(fill="x", padx=12, pady=10)

        self._hdr(grid, 0, " ")
        self._hdr(grid, 1, "Pan")
        self._hdr(grid, 2, "Tilt")
        self._hdr(grid, 3, "Zoom")
        self._hdr(grid, 4, "불러오기")
        self._hdr(grid, 5, "저장하기")

        self.ptz_vars = []
        for i, label in enumerate(["Preset1", "Preset2", "Preset3"], start=1):
            self._row(grid, i, label)

        # --- Right top: Tour config ---
        lf_tour = ttk.Labelframe(right, text="장치 투어(1→2→3) & 시간", style="Card.TLabelframe")
        lf_tour.pack(fill="x", pady=6)

        cfg = tk.Frame(lf_tour, bg=PANEL_BG)
        cfg.pack(fill="x", padx=12, pady=10)

        # Device tour params
        self.speed_var = tk.IntVar(value=TOUR_SPEED_RPM_DEFAULT)
        self.delay123_var = tk.IntVar(value=DELAY_1MIN_DEFAULT)
        self.settle_var = tk.DoubleVar(value=2.0)

        self._opt(cfg, "투어 속도(rpm)", self.speed_var, 8)
        self._opt(cfg, "1·2·3 지연(초)", self.delay123_var, 8)
        self._opt(cfg, "Settle(s)", self.settle_var, 6)

        # Time control
        self.cycle_min_var = tk.IntVar(value=60)
        self.normalize_var = tk.IntVar(value=1)
        self.total_limit_min_var = tk.StringVar(value="")

        self._opt(cfg, "사이클 목표(분)", self.cycle_min_var, 6)
        self._check(cfg, "사이클 정규화(정확히 맞추기)", self.normalize_var)
        self._opt(cfg, "총 제한(분, 비우면 무제한)", self.total_limit_min_var, 12)

        # Actions
        act = tk.Frame(lf_tour, bg=PANEL_BG)
        act.pack(fill="x", padx=12, pady=(0, 12))
        self.btn_write_steps = ttk.Button(act, text="스텝 쓰기(1~3)", command=self.write_tour_steps, width=16, state="disabled")
        self.btn_write_steps.pack(side="left")
        self.tour_on_btn  = ttk.Button(act, text="켜기", style="Accent.TButton", command=self.start_tour, width=12, state="disabled")
        self.tour_off_btn = ttk.Button(act, text="끄기", command=self.stop_tour, width=12, state="disabled")
        self.tour_on_btn.pack(side="left", padx=8)
        self.tour_off_btn.pack(side="left")

        # --- Right bottom: Cycle progress ---
        lf_prog = ttk.Labelframe(right, text="사이클 진행", style="Card.TLabelframe")
        lf_prog.pack(fill="x", pady=6)
        progf = tk.Frame(lf_prog, bg=PANEL_BG)
        progf.pack(fill="x", padx=12, pady=10)

        self.progress = ttk.Progressbar(progf, style="Progress.Horizontal.TProgressbar", maximum=100)
        self.progress.pack(fill="x")
        self.progress_lbl = tk.Label(progf, text="대기 중", fg=SUBTEXT_FG, bg=PANEL_BG, anchor="w")
        self.progress_lbl.pack(fill="x", pady=(6, 0))

        # --- Bottom: Logs ---
        lf_log = ttk.Labelframe(self, text="로그", style="Card.TLabelframe")
        lf_log.pack(fill="both", expand=True, padx=20, pady=(6, 16))
        self.txt = tk.Text(lf_log, height=10, bg="#171717", fg="#e6e6e6", insertbackground="#e6e6e6",
                           bd=0, relief="flat")
        self.txt.pack(fill="both", expand=True, padx=10, pady=10)

        # Periodic UI update (progress)
        self.after(200, self._ui_pulse)

        # WM close
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ---------- small UI helpers ----------
    def _set_led(self, color):
        self.led.delete("all")
        self.led.create_oval(2, 2, 14, 14, fill=color, outline=color)

    def _hdr(self, parent, col, text):
        tk.Label(parent, text=text, fg=TEXT_FG, bg=PANEL_BG,
                 font=("맑은 고딕", 16, "bold")).grid(row=0, column=col, padx=10, pady=8, sticky="w")

    def _row(self, parent, idx, title):
        r = idx
        tk.Label(parent, text=title, fg=TEXT_FG, bg=PANEL_BG,
                 font=("맑은 고딕", 18)).grid(row=r, column=0, sticky="w", padx=(0, 16), pady=8)

        pan_v, tilt_v, zoom_v = tk.StringVar(), tk.StringVar(), tk.StringVar()
        self.ptz_vars.append((pan_v, tilt_v, zoom_v))
        w = 20
        tk.Entry(parent, textvariable=pan_v,  width=w, font=("맑은 고딕", 12), bg="#3a3a3a", fg=TEXT_FG, relief="flat").grid(row=r, column=1, padx=8)
        tk.Entry(parent, textvariable=tilt_v, width=w, font=("맑은 고딕", 12), bg="#3a3a3a", fg=TEXT_FG, relief="flat").grid(row=r, column=2, padx=8)
        tk.Entry(parent, textvariable=zoom_v, width=w, font=("맑은 고딕", 12), bg="#3a3a3a", fg=TEXT_FG, relief="flat").grid(row=r, column=3, padx=8)

        ttk.Button(parent, text="불러오기", command=lambda n=idx: self.goto_preset(n), width=12).grid(row=r, column=4, padx=8)
        ttk.Button(parent, text="저장하기", command=lambda n=idx: self.save_preset(n), width=12).grid(row=r, column=5, padx=8)

    def _opt(self, parent, label, var, width):
        f = tk.Frame(parent, bg=PANEL_BG)
        f.pack(side="left", padx=8)
        tk.Label(f, text=label, fg=TEXT_FG, bg=PANEL_BG).pack(anchor="w")
        ttk.Entry(f, textvariable=var, width=width).pack(anchor="w")

    def _check(self, parent, label, var):
        f = tk.Frame(parent, bg=PANEL_BG)
        f.pack(side="left", padx=8)
        ttk.Checkbutton(f, text=label, variable=var).pack(anchor="w")

    def _log(self, msg: str):
        self.txt.insert("end", msg + "\n")
        self.txt.see("end")

    def _status(self, msg: str):
        self._log(msg)

    # ---------- connection ----------
    def on_connect(self):
        s = self.ipport_var.get().strip()
        if ":" not in s:
            messagebox.showerror("오류", "IP:PORT 형식으로 입력하세요. 예) 192.168.0.50:8899")
            return
        ip, port_str = s.rsplit(":", 1)
        try:
            port = int(port_str)
        except:
            messagebox.showerror("오류", "Port는 숫자여야 합니다."); return

        try:
            self.client.connect(ip, port)
            self.connected = True
            self._set_led("#34c759")  # green
            self.btn_disconnect.config(state="normal")
            self.btn_write_steps.config(state="normal")
            self.tour_on_btn.config(state="normal")
            self._status(f"[연결] {ip}:{port} (ID=1)")
        except Exception as e:
            self._set_led("#ff453a")  # red
            messagebox.showerror("연결 실패", str(e))

    def on_disconnect(self):
        self.stop_tour()
        self.client.close()
        self.connected = False
        self._set_led("#888888")
        self.btn_disconnect.config(state="disabled")
        self.btn_write_steps.config(state="disabled")
        self.tour_on_btn.config(state="disabled")
        self.tour_off_btn.config(state="disabled")
        self._status("[해제] 연결 종료")

    def ensure_conn(self):
        if not self.connected:
            raise RuntimeError("연결되지 않았습니다. 먼저 연결하세요.")

    # ---------- presets ----------
    def save_preset(self, n):
        try:
            self.ensure_conn()
            pkt = self.client.preset_save(n)
            self._status(f"[프리셋 저장] {n} -> {pkt.hex(' ')}")
        except Exception as e:
            self._status(f"[에러] 프리셋 저장 실패: {e}")

    def goto_preset(self, n):
        try:
            self.ensure_conn()
            pkt = self.client.preset_recall(n)
            self._status(f"[프리셋 호출] {n} -> {pkt.hex(' ')}")
        except Exception as e:
            self._status(f"[에러] 프리셋 호출 실패: {e}")

    # ---------- tour config ----------
    def write_tour_steps(self):
        try:
            self.ensure_conn()
            speed = int(self.speed_var.get())
            delay = max(1, min(255, int(self.delay123_var.get())))
            for p in (1, 2, 3):
                pkt = self.client.set_tour_step(p, speed, delay)
                self._status(f"[투어 스텝 설정] Preset {p}, speed={speed} rpm, delay={delay}s -> {pkt.hex(' ')}")
            messagebox.showinfo("완료", "투어 스텝(1~3) 설정 완료")
        except Exception as e:
            messagebox.showerror("에러", f"투어 스텝 설정 실패: {e}")

    # ---------- tour flow (#2) ----------
    def start_tour(self):
        try:
            self.ensure_conn()
        except Exception as e:
            messagebox.showerror("연결 오류", str(e)); return
        if self.tour_thread and self.tour_thread.is_alive():
            return

        self.tour_stop.clear()
        self.tour_on_btn.config(state="disabled")
        self.tour_off_btn.config(state="normal")
        self._set_led("#ffd60a")  # amber (running)

        self.tour_thread = threading.Thread(target=self._tour_worker, daemon=True)
        self.tour_thread.start()

    def stop_tour(self):
        self.tour_stop.set()
        self.tour_off_btn.config(state="disabled")
        self.tour_on_btn.config(state="normal")
        try:
            self.client.tour_stop()
        except Exception:
            pass
        self._status("투어 중지 요청")

    def _sleep_with_stop(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            if self.tour_stop.is_set():
                return False
            time.sleep(0.2)
        return True

    def _tour_worker(self):
        """Flow #2: (장치투어) 1→2→3 → (정지) → 프리셋1 유지 → 반복 + 진행률 갱신"""
        try:
            # 실행 전 스텝을 한 번 더 써서 확실히 반영
            speed = int(self.speed_var.get())
            delay = max(1, min(255, int(self.delay123_var.get())))
            for p in (1, 2, 3):
                self.client.set_tour_step(p, speed, delay)

            normalize = bool(self.normalize_var.get())
            try:
                target_cycle_sec = int(self.cycle_min_var.get()) * 60
            except:
                target_cycle_sec = 3600
            total_limit_str = str(self.total_limit_min_var.get()).strip()
            total_limit_sec = int(total_limit_str) * 60 if total_limit_str else 0
            total_start = time.time()

            while not self.tour_stop.is_set():
                self.cycle_start_ts = time.time()

                # 1) 장치 투어 START (1→2→3, 각 delay초)
                pkt = self.client.tour_start()
                self._status(f"[투어 시작] -> {pkt.hex(' ')}  (1→2→3 각 {delay}s)")
                if not self._sleep_with_stop(3 * delay):
                    break

                # 2) 장치 투어 STOP
                pkt = self.client.tour_stop()
                self._status(f"[투어 정지] -> {pkt.hex(' ')}")

                # 3) 프리셋 1 호출
                pkt = self.client.preset_recall(1)
                self._status(f"[프리셋 호출] 1번 -> {pkt.hex(' ')}")

                # 작은 안정화
                settle = float(self.settle_var.get())
                if settle > 0 and not self._sleep_with_stop(settle):
                    break

                # 4) 유지 시간 결정 + 진행률 타깃 설정
                if normalize and target_cycle_sec > 0:
                    elapsed = time.time() - self.cycle_start_ts
                    hold = max(0, target_cycle_sec - elapsed)
                    note = f"(정규화) 목표 {int(target_cycle_sec)}s, 경과 {int(elapsed)}s → 유지 {int(hold)}s"
                    self.cycle_target_sec = target_cycle_sec
                else:
                    hold = DELAY_57MIN_DEFAULT
                    note = f"57분 고정 유지({hold}s)"
                    # 진행률 타깃(대략치): 투어지연 3*delay + settle + hold
                    self.cycle_target_sec = 3 * delay + settle + hold
                self._status(f"[유지] 1번 {note}")

                if not self._sleep_with_stop(hold):
                    break

                if total_limit_sec and (time.time() - total_start) >= total_limit_sec:
                    self._status(f"[완료] 총 실행 시간 제한 {int(total_limit_sec/60)}분 도달 → 종료")
                    break

            self._set_led("#34c759" if self.connected else "#888888")  # green or gray
        except Exception as e:
            self._status(f"[에러] {e}")
            self._set_led("#ff453a")
        finally:
            self.tour_off_btn.config(state="disabled")
            self.tour_on_btn.config(state="normal")

    # ---------- progress UI pulse ----------
    def _ui_pulse(self):
        # 주기적으로 진행률/남은 시간 텍스트 갱신
        try:
            if self.cycle_target_sec > 0 and self.cycle_start_ts > 0:
                elapsed = time.time() - self.cycle_start_ts
                pct = max(0, min(100, int((elapsed / self.cycle_target_sec) * 100)))
                self.progress["value"] = pct
                remain = max(0, int(self.cycle_target_sec - elapsed))
                self.progress_lbl.config(text=f"사이클 진행: {pct}%  •  남은 시간 ~ {remain}s")
            else:
                self.progress["value"] = 0
                self.progress_lbl.config(text="대기 중")
        finally:
            self.after(250, self._ui_pulse)

    # ---------- window close ----------
    def _on_close(self):
        self.stop_tour()
        try:
            self.client.close()
        except:
            pass
        self.destroy()

# =========================
# main
# =========================
if __name__ == "__main__":
    app = PTZApp()
    app.mainloop()

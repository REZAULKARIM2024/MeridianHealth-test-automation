import React, { useState, useEffect } from "react";
import {
  Home, CalendarDays, ShoppingBag, FlaskConical, User, ArrowLeft,
  Check, X, Plus, Minus, Search, Upload, LogOut, Star, MapPin, Clock,
  Smartphone, Monitor, ChevronRight, RotateCcw, AlertCircle, Loader2
} from "lucide-react";
import { api } from "./api.js";

/* ---------------------------------------------------------
   MERIDIAN — a demo healthcare app for QA / test-case practice
   Flows: Auth, Home, Book (telehealth), Pharmacy (cart/checkout),
   Trials (clinical trial matching), Profile.
   All data is mock/local — nothing leaves the browser.
--------------------------------------------------------- */

const C = {
  bg: "#F3F6F4",
  surface: "#FFFFFF",
  surfaceAlt: "#EAF1EC",
  ink: "#152420",
  inkMuted: "#5B6B63",
  border: "#DCE6E0",
  primary: "#14453D",
  primaryDark: "#0C2F29",
  primaryTint: "#CFE3D8",
  accent: "#E2A64B",
  accentDark: "#C68A2F",
  danger: "#B3432B",
  dangerTint: "#F6E3DD",
};

/* Global CSS (fonts, focus ring, scrollbar) lives in src/index.css + index.html, not in an inline
   <style> element, so the page can run under a CSP without style-src 'unsafe-inline'. */

/* ---------------- Static UI-only lookups ---------------- */
/* Doctors, medicines, and trials now come from the API (backed by MySQL) —
   see src/api.js and server/. Only the condition dropdown labels stay local
   since they're pure UI copy, not data. */

const CONDITIONS = [
  { value: "", label: "Select a condition" },
  { value: "diabetes", label: "Type 2 Diabetes" },
  { value: "hypertension", label: "Hypertension" },
  { value: "migraine", label: "Migraine" },
  { value: "asthma", label: "Asthma" },
  { value: "none", label: "None of the above" },
];

/* ---------------- Small building blocks ---------------- */

function Btn({ children, onClick, variant = "primary", full, disabled, type = "button", icon: Icon, testId }) {
  const styles = {
    primary: { background: disabled ? "#9FB3AC" : C.primary, color: "#fff", border: "none" },
    accent: { background: disabled ? "#E9CFA0" : C.accent, color: C.primaryDark, border: "none" },
    ghost: { background: "transparent", color: C.primary, border: `1px solid ${C.border}` },
    danger: { background: "transparent", color: C.danger, border: `1px solid ${C.dangerTint}` },
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={`mh-focus mh-anim ${full ? "w-full" : ""} flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors`}
      style={{ ...styles, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function Card({ children, style, className = "" }) {
  return (
    <div
      className={`rounded-2xl p-4 ${className}`}
      style={{ background: C.surface, border: `1px solid ${C.border}`, ...style }}
    >
      {children}
    </div>
  );
}

function Field({ label, error, children, hint }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium mb-1.5" style={{ color: C.ink }}>{label}</span>
      {children}
      {hint && !error && <span className="block text-xs mt-1" style={{ color: C.inkMuted }}>{hint}</span>}
      {error && (
        <span className="flex items-center gap-1 text-xs mt-1.5" style={{ color: C.danger }}>
          <AlertCircle size={12} /> {error}
        </span>
      )}
    </label>
  );
}

const inputStyle = (hasError) => ({
  border: `1px solid ${hasError ? C.danger : C.border}`,
  background: "#fff",
});

function TextInput(props) {
  const { error, ...rest } = props;
  return (
    <input
      {...rest}
      className="mh-focus w-full rounded-lg px-3 py-2.5 text-sm"
      style={inputStyle(error)}
    />
  );
}

function SelectInput({ error, children, ...rest }) {
  return (
    <select {...rest} className="mh-focus w-full rounded-lg px-3 py-2.5 text-sm bg-white" style={inputStyle(error)}>
      {children}
    </select>
  );
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { background: C.surfaceAlt, color: C.primary },
    accent: { background: "#FBEBD2", color: C.accentDark },
    danger: { background: C.dangerTint, color: C.danger },
  }[tone];
  return (
    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-medium" style={tones}>
      {children}
    </span>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 sticky top-0 z-10" style={{ background: C.bg }}>
      {onBack && (
        <button onClick={onBack} className="mh-focus rounded-full p-1.5" style={{ background: C.surface, border: `1px solid ${C.border}` }} aria-label="Go back">
          <ArrowLeft size={18} color={C.primary} />
        </button>
      )}
      <h1 className="mh-display text-lg font-semibold" style={{ color: C.primaryDark }}>{title}</h1>
    </div>
  );
}

/* ---------------- Auth screen ---------------- */

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const validate = () => {
    const e = {};
    if (mode === "signup" && !form.name.trim()) e.name = "Enter your full name.";
    if (!form.email.trim()) e.email = "Enter your email address.";
    else if (!emailValid) e.email = "Enter a valid email address.";
    if (!form.password) e.password = "Enter a password.";
    else if (mode === "signup" && form.password.length < 8) e.password = "Use at least 8 characters.";
    if (mode === "signup" && form.confirm !== form.password) e.confirm = "Passwords don't match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setSubmitted(true);
    setServerError("");
    if (!validate()) return;
    setLoading(true);
    try {
      const result = mode === "signup"
        ? await api.signup(form.name, form.email, form.password)
        : await api.login(form.email, form.password);
      onAuth({ user: result.user, token: result.token });
    } catch (err) {
      // Server-side errors (duplicate email on signup, invalid credentials on
      // login, etc.) surface here — these can't be caught by client validation alone.
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-10" style={{ background: C.primaryDark }}>
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: C.accent }}>
          <FlaskConical size={26} color={C.primaryDark} />
        </div>
        <h1 className="mh-display text-3xl font-semibold text-white">Meridian</h1>
        <p className="text-sm mt-1" style={{ color: C.primaryTint }}>Care, medicine, and trials in one place</p>
      </div>

      <Card>
        <div className="flex rounded-xl p-1 mb-5" style={{ background: C.surfaceAlt }}>
          {["login", "signup"].map((m) => (
            <button
              key={m}
              data-testid={`tab-${m}`}
              onClick={() => { setMode(m); setErrors({}); setSubmitted(false); }}
              className="mh-focus flex-1 rounded-lg py-2 text-sm font-semibold transition-colors"
              style={{ background: mode === m ? C.surface : "transparent", color: mode === m ? C.primary : C.inkMuted }}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate>
          {mode === "signup" && (
            <Field label="Full name" error={submitted ? errors.name : null}>
              <TextInput data-testid="input-name" error={submitted && errors.name} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jordan Lee" />
            </Field>
          )}
          <Field label="Email" error={submitted ? errors.email : null}>
            <TextInput data-testid="input-email" type="email" error={submitted && errors.email} value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
          </Field>
          <Field label="Password" error={submitted ? errors.password : null} hint={mode === "signup" ? "At least 8 characters" : null}>
            <TextInput data-testid="input-password" type="password" error={submitted && errors.password} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </Field>
          {mode === "signup" && (
            <Field label="Confirm password" error={submitted ? errors.confirm : null}>
              <TextInput data-testid="input-confirm" type="password" error={submitted && errors.confirm} value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="••••••••" />
            </Field>
          )}
          <Btn type="submit" full variant="accent" testId="btn-auth-submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </Btn>
          {serverError && (
            <p data-testid="auth-server-error" className="flex items-center gap-1 text-xs mt-3 justify-center" style={{ color: C.danger }}>
              <AlertCircle size={12} /> {serverError}
            </p>
          )}
        </form>
      </Card>
      <p className="text-center text-xs mt-5" style={{ color: C.primaryTint }}>
      </p>
    </div>
  );
}

/* ---------------- Home screen ---------------- */

function HomeScreen({ user, booking, cartCount, go }) {
  const actions = [
    { key: "book", label: "Book a doctor", desc: "Telehealth in minutes", icon: CalendarDays },
    { key: "pharmacy", label: "Order medicine", desc: `${cartCount} item${cartCount === 1 ? "" : "s"} in cart`, icon: ShoppingBag },
    { key: "trials", label: "Find a trial", desc: "Get matched by condition", icon: FlaskConical },
  ];
  return (
    <div className="px-4 pb-4">
      <TopBar title={`Hi, ${user.name.split(" ")[0]}`} />
      {booking && (
        <Card className="mb-4" style={{ background: C.primaryTint, border: "none" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.primary }}>Upcoming visit</p>
              <p className="mh-display font-semibold mt-0.5">{booking.doctor.name}</p>
              <p className="text-sm" style={{ color: C.inkMuted }}>{booking.slot} · {booking.doctor.specialty}</p>
            </div>
            <Clock size={20} color={C.primary} />
          </div>
        </Card>
      )}
      <div className="grid gap-3">
        {actions.map((a) => (
          <button key={a.key} data-testid={`home-action-${a.key}`} onClick={() => go(a.key)} className="mh-focus mh-anim text-left">
            <Card className="flex items-center justify-between hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: C.surfaceAlt }}>
                  <a.icon size={20} color={C.primary} />
                </div>
                <div>
                  <p className="font-semibold text-sm">{a.label}</p>
                  <p className="text-xs" style={{ color: C.inkMuted }}>{a.desc}</p>
                </div>
              </div>
              <ChevronRight size={18} color={C.inkMuted} />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Book (telehealth) flow ---------------- */

function BookScreen({ onBook, goHome, doctors, token }) {
  const [step, setStep] = useState("list");
  const [doctor, setDoctor] = useState(null);
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  if (step === "confirmed") {
    const b = confirmedBooking;
    return (
      <div className="px-4 pb-4">
        <TopBar title="Appointment" onBack={goHome} />
        <Card data-testid="appointment-confirmation" style={{ background: C.primaryTint, border: "none" }} className="text-center py-8">
          <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: C.primary }}>
            <Check size={22} color="#fff" />
          </div>
          <p className="mh-display text-lg font-semibold">Appointment confirmed</p>
          <p data-testid="appointment-confirmation-detail" className="text-sm mt-1" style={{ color: C.inkMuted }}>{b.doctor.name} · {b.slot}</p>
        </Card>
        <Btn full onClick={goHome} testId="btn-back-home">Back to home</Btn>
      </div>
    );
  }

  if (step === "slots") {
    return (
      <div className="px-4 pb-4">
        <TopBar title={doctor.name} onBack={() => setStep("list")} />
        <p className="text-sm mb-3" style={{ color: C.inkMuted }}>{doctor.specialty} · {doctor.rating}★</p>
        <p className="text-sm font-semibold mb-2">Choose a time</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {doctor.slots.map((s) => (
            <button key={s} data-testid={`slot-${s.replace(/[^0-9A-Za-z]/g, "")}`} onClick={() => setSlot(s)} aria-pressed={slot === s} className="mh-focus mh-anim rounded-lg py-2.5 text-sm font-medium"
              style={{ background: slot === s ? C.primary : C.surface, color: slot === s ? "#fff" : C.ink, border: `1px solid ${slot === s ? C.primary : C.border}` }}>
              {s}
            </button>
          ))}
        </div>
        <Field label="Reason for visit (optional)">
          <textarea data-testid="input-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="Briefly describe your symptoms or reason for the visit"
            className="mh-focus w-full rounded-lg px-3 py-2.5 text-sm" style={inputStyle(false)} />
        </Field>
        {error && <p data-testid="error-slot" className="text-xs mb-3 flex items-center gap-1" style={{ color: C.danger }}><AlertCircle size={12} />{error}</p>}
        <Btn full variant="accent" testId="btn-book-appointment" disabled={loading} onClick={async () => {
          if (!slot) { setError("Select a time slot to continue."); return; }
          setError("");
          setLoading(true);
          try {
            const saved = await api.createAppointment(token, doctor.id, slot, reason);
            const booking = { doctor: saved.doctor, slot: saved.slot };
            setConfirmedBooking(booking);
            onBook(booking);
            setStep("confirmed");
          } catch (err) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        }}>{loading ? "Booking…" : "Book appointment"}</Btn>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <TopBar title="Book a doctor" onBack={goHome} />
      <div className="grid gap-3">
        {doctors.map((d) => (
          <button key={d.id} data-testid={`doctor-${d.id}`} onClick={() => { setDoctor(d); setSlot(null); setError(""); setStep("slots"); }} className="mh-focus mh-anim text-left">
            <Card className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{d.name}</p>
                <p className="text-xs" style={{ color: C.inkMuted }}>{d.specialty}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Star size={12} color={C.accentDark} fill={C.accentDark} />
                  <span className="text-xs" style={{ color: C.inkMuted }}>{d.rating}</span>
                </div>
              </div>
              <ChevronRight size={18} color={C.inkMuted} />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Pharmacy flow ---------------- */

function PharmacyScreen({ cart, setCart, goHome, medicines, token }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("catalog"); // catalog | cart | checkout | done
  const [rxFile, setRxFile] = useState(null);
  const [shipping, setShipping] = useState({ address: "", city: "", zip: "" });
  const [payment, setPayment] = useState({ card: "", expiry: "", cvv: "" });
  const [errors, setErrors] = useState({});
  const [orderId, setOrderId] = useState(null);
  const [placing, setPlacing] = useState(false);

  const filtered = medicines.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
  const cartItems = cart.map((c) => ({ ...medicines.find((m) => m.id === c.id), qty: c.qty }));
  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const needsRx = cartItems.some((i) => i.rx);

  const addToCart = (m) => {
    if (m.stock === 0) return;
    setCart((prev) => {
      const found = prev.find((c) => c.id === m.id);
      if (found) return prev.map((c) => (c.id === m.id ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { id: m.id, qty: 1 }];
    });
  };
  const changeQty = (id, delta) => {
    setCart((prev) => prev
      .map((c) => (c.id === id ? { ...c, qty: c.qty + delta } : c))
      .filter((c) => c.qty > 0));
  };

  if (view === "done") {
    return (
      <div className="px-4 pb-4">
        <TopBar title="Order placed" onBack={goHome} />
        <Card data-testid="order-confirmation" style={{ background: C.primaryTint, border: "none" }} className="text-center py-8">
          <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: C.primary }}>
            <Check size={22} color="#fff" />
          </div>
          <p className="mh-display text-lg font-semibold">Order confirmed</p>
          <p data-testid="order-confirmation-detail" className="text-sm mt-1" style={{ color: C.inkMuted }}>Order #{orderId} · Estimated delivery in 2–3 days</p>
        </Card>
        <Btn full onClick={goHome} testId="btn-back-home">Back to home</Btn>
      </div>
    );
  }

  if (view === "checkout") {
    const validate = () => {
      const e = {};
      if (needsRx && !rxFile) e.rx = "Upload a valid prescription for Rx items in your cart.";
      if (!shipping.address.trim()) e.address = "Enter a shipping address.";
      if (!shipping.city.trim()) e.city = "Enter a city.";
      if (!/^\d{4,6}$/.test(shipping.zip)) e.zip = "Enter a valid ZIP/postal code.";
      if (!/^\d{13,16}$/.test(payment.card.replace(/\s/g, ""))) e.card = "Enter a valid card number.";
      if (!/^\d{2}\/\d{2}$/.test(payment.expiry)) e.expiry = "Use MM/YY format.";
      if (!/^\d{3,4}$/.test(payment.cvv)) e.cvv = "Enter a valid CVV.";
      setErrors(e);
      return Object.keys(e).length === 0;
    };
    return (
      <div className="px-4 pb-4">
        <TopBar title="Checkout" onBack={() => setView("cart")} />
        {needsRx && (
          <Field label="Prescription upload" error={errors.rx}>
            <label className="mh-focus mh-anim flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium cursor-pointer"
              style={{ border: `1px dashed ${errors.rx ? C.danger : C.border}`, color: C.primary }}>
              <Upload size={16} />
              {rxFile ? rxFile : "Upload prescription (image or PDF)"}
              <input data-testid="input-rx-upload" type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setRxFile(e.target.files[0]?.name || null)} />
            </label>
          </Field>
        )}
        <Field label="Shipping address" error={errors.address}>
          <TextInput data-testid="input-address" error={errors.address} value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} placeholder="123 Main St" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" error={errors.city}>
            <TextInput data-testid="input-city" error={errors.city} value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} placeholder="Springfield" />
          </Field>
          <Field label="ZIP code" error={errors.zip}>
            <TextInput data-testid="input-zip" error={errors.zip} value={shipping.zip} onChange={(e) => setShipping({ ...shipping, zip: e.target.value })} placeholder="12345" />
          </Field>
        </div>
        <Field label="Card number" error={errors.card}>
          <TextInput data-testid="input-card" error={errors.card} value={payment.card} onChange={(e) => setPayment({ ...payment, card: e.target.value })} placeholder="4242 4242 4242 4242" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expiry" error={errors.expiry}>
            <TextInput data-testid="input-expiry" error={errors.expiry} value={payment.expiry} onChange={(e) => setPayment({ ...payment, expiry: e.target.value })} placeholder="MM/YY" />
          </Field>
          <Field label="CVV" error={errors.cvv}>
            <TextInput data-testid="input-cvv" error={errors.cvv} value={payment.cvv} onChange={(e) => setPayment({ ...payment, cvv: e.target.value })} placeholder="123" />
          </Field>
        </div>
        <div className="flex items-center justify-between py-3 mb-3 text-sm font-semibold" style={{ borderTop: `1px solid ${C.border}` }}>
          <span>Total</span><span data-testid="checkout-total">${total.toFixed(2)}</span>
        </div>
        {errors.server && (
          <p data-testid="checkout-server-error" className="flex items-center gap-1 text-xs mb-3" style={{ color: C.danger }}>
            <AlertCircle size={12} /> {errors.server}
          </p>
        )}
        <Btn full variant="accent" testId="btn-place-order" disabled={placing} onClick={async () => {
          if (!validate()) return;
          setPlacing(true);
          setErrors((prev) => ({ ...prev, server: null }));
          try {
            const items = cartItems.map((i) => ({ medicineId: i.id, qty: i.qty }));
            const result = await api.placeOrder(token, {
              items, address: shipping.address, city: shipping.city, zip: shipping.zip,
              rxConfirmed: needsRx ? !!rxFile : undefined,
            });
            setOrderId(result.orderId);
            setCart([]);
            setView("done");
          } catch (err) {
            setErrors((prev) => ({ ...prev, server: err.message }));
          } finally {
            setPlacing(false);
          }
        }}>{placing ? "Placing order…" : "Place order"}</Btn>
      </div>
    );
  }

  if (view === "cart") {
    return (
      <div className="px-4 pb-4">
        <TopBar title="Your cart" onBack={() => setView("catalog")} />
        {cartItems.length === 0 ? (
          <Card className="text-center py-10">
            <p className="text-sm" style={{ color: C.inkMuted }}>Your cart is empty.</p>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 mb-4">
              {cartItems.map((i) => (
                <Card key={i.id} data-testid={`cart-item-${i.id}`} className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{i.name}</p>
                    <p className="text-xs" style={{ color: C.inkMuted }}>${i.price.toFixed(2)} each {i.rx && "· Rx required"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button data-testid={`btn-dec-${i.id}`} onClick={() => changeQty(i.id, -1)} className="mh-focus rounded-full p-1" style={{ border: `1px solid ${C.border}` }} aria-label={`Decrease ${i.name}`}><Minus size={14} /></button>
                    <span data-testid={`qty-${i.id}`} className="w-5 text-center text-sm">{i.qty}</span>
                    <button data-testid={`btn-inc-${i.id}`} onClick={() => changeQty(i.id, 1)} className="mh-focus rounded-full p-1" style={{ border: `1px solid ${C.border}` }} aria-label={`Increase ${i.name}`}><Plus size={14} /></button>
                  </div>
                </Card>
              ))}
            </div>
            <div className="flex items-center justify-between mb-4 text-sm font-semibold">
              <span>Total</span><span data-testid="cart-total">${total.toFixed(2)}</span>
            </div>
            <Btn full variant="accent" testId="btn-proceed-checkout" onClick={() => setView("checkout")}>Proceed to checkout</Btn>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <TopBar title="Pharmacy" onBack={goHome} />
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" color={C.inkMuted} />
        <input data-testid="input-medicine-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medicine"
          className="mh-focus w-full rounded-lg pl-9 pr-3 py-2.5 text-sm" style={inputStyle(false)} />
      </div>
      <div className="grid gap-3 mb-20">
        {filtered.length === 0 && <p data-testid="no-results" className="text-sm text-center py-6" style={{ color: C.inkMuted }}>No medicines match "{query}".</p>}
        {filtered.map((m) => (
          <Card key={m.id} data-testid={`medicine-${m.id}`} className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{m.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs" style={{ color: C.inkMuted }}>${m.price.toFixed(2)}</span>
                {m.rx && <Badge tone="accent">Rx required</Badge>}
                {m.stock === 0 && <Badge tone="danger">Out of stock</Badge>}
              </div>
            </div>
            <Btn variant={m.stock === 0 ? "ghost" : "primary"} disabled={m.stock === 0} testId={`btn-add-${m.id}`} onClick={() => addToCart(m)}>
              {m.stock === 0 ? "Notify me" : "Add"}
            </Btn>
          </Card>
        ))}
      </div>
      {cartItems.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4" style={{ maxWidth: "inherit" }}>
          <Btn full variant="accent" testId="btn-view-cart" onClick={() => setView("cart")}>
            View cart · {cartItems.reduce((s, i) => s + i.qty, 0)} item(s) · ${total.toFixed(2)}
          </Btn>
        </div>
      )}
    </div>
  );
}

/* ---------------- Trials flow ---------------- */

function TrialsScreen({ interests, setInterests, goHome, token }) {
  const [profile, setProfile] = useState({ age: "", condition: "" });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [interestLoading, setInterestLoading] = useState(null);

  const validate = () => {
    const e = {};
    const ageNum = Number(profile.age);
    if (!profile.age) e.age = "Enter your age.";
    else if (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 120) e.age = "Enter a valid age (0–120).";
    if (!profile.condition) e.condition = "Select a condition.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const findMatches = async () => {
    setSubmitted(true);
    if (!validate()) return;
    if (profile.condition === "none") { setMatches([]); return; }
    setLoading(true);
    try {
      const rows = await api.matchTrials(profile.age, profile.condition);
      setMatches(rows);
    } catch (err) {
      setErrors((prev) => ({ ...prev, server: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const expressInterest = async (trialId) => {
    setInterestLoading(trialId);
    try {
      await api.expressInterest(token, trialId);
      setInterests((prev) => new Set(prev).add(trialId));
    } catch (err) {
      setErrors((prev) => ({ ...prev, server: err.message }));
    } finally {
      setInterestLoading(null);
    }
  };

  return (
    <div className="px-4 pb-4">
      <TopBar title="Clinical trials" onBack={goHome} />
      <Card className="mb-4">
        <p className="text-sm font-semibold mb-3">Tell us about you</p>
        <Field label="Age" error={submitted ? errors.age : null}>
          <TextInput data-testid="input-age" type="number" error={submitted && errors.age} value={profile.age}
            onChange={(e) => setProfile({ ...profile, age: e.target.value })} placeholder="35" />
        </Field>
        <Field label="Primary condition" error={submitted ? errors.condition : null}>
          <SelectInput data-testid="select-condition" error={submitted && errors.condition} value={profile.condition}
            onChange={(e) => setProfile({ ...profile, condition: e.target.value })}>
            {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </SelectInput>
        </Field>
        <Btn full testId="btn-find-trials" disabled={loading} onClick={findMatches}>
          {loading ? "Searching…" : "Find matching trials"}
        </Btn>
        {errors.server && (
          <p data-testid="trials-server-error" className="flex items-center gap-1 text-xs mt-3" style={{ color: C.danger }}>
            <AlertCircle size={12} /> {errors.server}
          </p>
        )}
      </Card>

      {submitted && Object.keys(errors).length === 0 && !loading && (
        <>
          <p data-testid="trials-result-count" className="text-sm font-semibold mb-2">
            {matches.length ? `${matches.length} matching trial${matches.length > 1 ? "s" : ""}` : "No matching trials"}
          </p>
          {matches.length === 0 && (
            <Card className="text-center py-8">
              <p className="text-sm" style={{ color: C.inkMuted }}>No open trials match this profile right now. Check back later.</p>
            </Card>
          )}
          <div className="grid gap-3">
            {matches.map((t) => (
              <Card key={t.id} data-testid={`trial-${t.id}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge>{t.phase}</Badge>
                </div>
                <p className="font-semibold text-sm mb-1">{t.title}</p>
                <div className="flex items-center gap-1 text-xs mb-3" style={{ color: C.inkMuted }}>
                  <MapPin size={12} /> {t.location}
                </div>
                <Btn full variant={interests.has(t.id) ? "ghost" : "accent"} disabled={interests.has(t.id) || interestLoading === t.id}
                  testId={`btn-interest-${t.id}`}
                  onClick={() => expressInterest(t.id)}>
                  {interests.has(t.id) ? "Interest sent" : interestLoading === t.id ? "Sending…" : "Express interest"}
                </Btn>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Profile screen ---------------- */

function ProfileScreen({ user, onLogout, onReset }) {
  return (
    <div className="px-4 pb-4">
      <TopBar title="Profile" />
      <Card className="mb-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center font-semibold" style={{ background: C.primaryTint, color: C.primary }}>
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-sm">{user.name}</p>
          <p className="text-xs" style={{ color: C.inkMuted }}>{user.email}</p>
        </div>
      </Card>
      <Card className="mb-4">
        <p className="text-xs" style={{ color: C.inkMuted }}>
          This is a demo app for QA / test-case practice. Your account, appointments, orders, and trial interest are stored in a real MySQL database via the API — this isn't a real medical record, but it isn't wiped on reload either. Use the reset button below to clear your session's local view.
        </p>
      </Card>
      <div className="grid gap-2">
        <Btn full variant="ghost" icon={RotateCcw} testId="btn-reset-demo" onClick={onReset}>Reset demo data</Btn>
        <Btn full variant="danger" icon={LogOut} testId="btn-logout" onClick={onLogout}>Log out</Btn>
      </div>
    </div>
  );
}

/* ---------------- Nav shells ---------------- */

const TABS = [
  { key: "home", label: "Home", icon: Home },
  { key: "book", label: "Book", icon: CalendarDays },
  { key: "pharmacy", label: "Pharmacy", icon: ShoppingBag },
  { key: "trials", label: "Trials", icon: FlaskConical },
  { key: "profile", label: "Profile", icon: User },
];

function BottomNav({ active, go }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-around py-2 px-1"
      style={{ background: C.surface, borderTop: `1px solid ${C.border}`, maxWidth: "inherit" }}>
      {TABS.map((t) => (
        <button key={t.key} data-testid={`nav-${t.key}`} onClick={() => go(t.key)} className="mh-focus mh-anim flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg">
          <t.icon size={20} color={active === t.key ? C.primary : C.inkMuted} />
          <span className="text-[10px] font-medium" style={{ color: active === t.key ? C.primary : C.inkMuted }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function SideNav({ active, go, user }) {
  return (
    <div className="w-56 shrink-0 flex flex-col justify-between py-6" style={{ background: C.primaryDark }}>
      <div>
        <div className="flex items-center gap-2 px-5 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.accent }}>
            <FlaskConical size={16} color={C.primaryDark} />
          </div>
          <span className="mh-display text-white font-semibold">Meridian</span>
        </div>
        <div className="grid gap-1 px-3">
          {TABS.map((t) => (
            <button key={t.key} data-testid={`nav-${t.key}`} onClick={() => go(t.key)} className="mh-focus mh-anim flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
              style={{ background: active === t.key ? "rgba(255,255,255,0.1)" : "transparent", color: active === t.key ? "#fff" : C.primaryTint }}>
              <t.icon size={17} />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 text-xs" style={{ color: C.primaryTint }}>{user.email}</div>
    </div>
  );
}

/* ---------------- App root ---------------- */

const initialState = () => ({
  user: null, token: null, active: "home", booking: null, cart: [], interests: new Set(),
});

export default function MeridianHealthApp() {
  const [device, setDevice] = useState("mobile"); // mobile | desktop
  const [state, setState] = useState(initialState());
  const { user, token, active, booking, cart, interests } = state;

  const [doctors, setDoctors] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [apiError, setApiError] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, m] = await Promise.all([api.getDoctors(), api.getMedicines()]);
        if (!cancelled) { setDoctors(d); setMedicines(m); }
      } catch (err) {
        if (!cancelled) setApiError(
          "Couldn't reach the Meridian API. Make sure the backend (server/) is running on http://localhost:4000."
        );
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const setCart = (fn) => setState((s) => ({ ...s, cart: typeof fn === "function" ? fn(s.cart) : fn }));
  const setInterests = (fn) => setState((s) => ({ ...s, interests: typeof fn === "function" ? fn(s.interests) : fn }));

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const screen = apiError ? (
    <div className="px-4 pt-10 text-center">
      <AlertCircle size={28} color={C.danger} className="mx-auto mb-3" />
      <p className="font-semibold text-sm mb-1">Can't connect to the API</p>
      <p className="text-xs" style={{ color: C.inkMuted }}>{apiError}</p>
    </div>
  ) : loadingData ? (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} color={C.primary} className="animate-spin" />
    </div>
  ) : !user ? (
    <AuthScreen onAuth={({ user, token }) => patch({ user, token, active: "home" })} />
  ) : (() => {
    switch (active) {
      case "book": return <BookScreen doctors={doctors} token={token}
        onBook={(b) => patch({ booking: b })} goHome={() => patch({ active: "home" })} />;
      case "pharmacy": return <PharmacyScreen medicines={medicines} token={token} cart={cart} setCart={setCart}
        goHome={() => patch({ active: "home" })} />;
      case "trials": return <TrialsScreen token={token} interests={interests} setInterests={setInterests}
        goHome={() => patch({ active: "home" })} />;
      case "profile": return (
        <ProfileScreen user={user}
          onLogout={() => setState(initialState())}
          onReset={() => patch({ booking: null, cart: [], interests: new Set() })} />
      );
      default: return <HomeScreen user={user} booking={booking} cartCount={cartCount} go={(k) => patch({ active: k })} />;
    }
  })();

  const frameWidth = device === "mobile" ? 390 : 1100;

  return (
    <div className="mh-root w-full flex flex-col items-center py-6" style={{ background: C.bg, minHeight: 600 }}>

      <div className="flex items-center gap-2 mb-4 rounded-full p-1" style={{ background: C.surfaceAlt }}>
        <button data-testid="toggle-mobile" onClick={() => setDevice("mobile")} className="mh-focus flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ background: device === "mobile" ? C.surface : "transparent", color: device === "mobile" ? C.primary : C.inkMuted }}>
          <Smartphone size={13} /> Mobile
        </button>
        <button data-testid="toggle-desktop" onClick={() => setDevice("desktop")} className="mh-focus flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ background: device === "desktop" ? C.surface : "transparent", color: device === "desktop" ? C.primary : C.inkMuted }}>
          <Monitor size={13} /> Desktop
        </button>
      </div>

      <div data-testid="app-frame" className="mh-scroll overflow-hidden rounded-[28px] shadow-lg relative flex"
        style={{ width: frameWidth, maxWidth: "95vw", height: 700, background: C.bg, border: `8px solid ${C.primaryDark}` }}>

        {user && device === "desktop" && <SideNav active={active} go={(k) => patch({ active: k })} user={user} />}

        <div className="flex-1 overflow-y-auto mh-scroll relative" style={{ background: C.bg }}>
          {screen}
          {user && device === "mobile" && <div style={{ height: 64 }} />}
        </div>

        {user && device === "mobile" && <BottomNav active={active} go={(k) => patch({ active: k })} />}
      </div>

      <p className="text-xs mt-4 text-center max-w-sm" style={{ color: C.inkMuted }}>
        Demo healthcare app backed by a real MySQL database via the API in server/ — signup/login,
        telehealth booking, pharmacy checkout, and clinical trial matching all persist server-side.
      </p>
    </div>
  );
}

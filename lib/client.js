window.__ModuleLoader__.load({
	id: "dsh-balance-bar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;

		const CAP_KEY = "dsh-balance-bar.cap";
		const DEFAULT_USAGE_URL = "https://platform.deepseek.com/usage";
		const POLL_MS = 180000;

		const OPTIONS = {
			cap: 150,
			label: "\u4F59\u989D",
			usageUrl: DEFAULT_USAGE_URL
		};

		function configure(config) {
			if (!config || typeof config !== "object") return;
			const cap = Number(config.cap);
			if (Number.isFinite(cap) && cap > 0) OPTIONS.cap = cap;
			if (typeof config.label === "string" && config.label) OPTIONS.label = config.label;
			if (typeof config.usageUrl === "string" && config.usageUrl) OPTIONS.usageUrl = config.usageUrl;
		}

		function readCap() {
			try {
				const v = Number(window.localStorage.getItem(CAP_KEY));
				return Number.isFinite(v) && v >= OPTIONS.cap ? v : OPTIONS.cap;
			}
			catch (error) {
				return OPTIONS.cap;
			}
		}

		function raiseCap(total) {
			let cap = readCap();
			if (total > cap) {
				cap = Math.ceil(total / 50) * 50;
				try { window.localStorage.setItem(CAP_KEY, String(cap)); }
				catch (error) { }
			}
			return cap;
		}

		function accountOf(ctx) {
			const candidates = [];
			try { candidates.push(ctx.remote); } catch (error) { }
			try { if (typeof ctx.get === "function") candidates.push(ctx.get("remote")); } catch (error) { }
			try { candidates.push(ctx.api); } catch (error) { }
			for (const candidate of candidates) {
				if (candidate && candidate.account && typeof candidate.account.getBalance === "function") return candidate.account;
			}
			return void 0;
		}

		function metadata(ctx) {
			let locale = "zh";
			try { locale = ctx.locale.getSnapshot().active; } catch (error) { }
			const version = (window.__DSH_BOOT__ && window.__DSH_BOOT__.version) || "0.2.1-rc.2";
			return {
				version: String(version),
				locale,
				timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
			};
		}

		function sumCny(snapshot) {
			if (!snapshot || typeof snapshot !== "object") return null;
			const list = [];
			if (Array.isArray(snapshot.value)) list.push.apply(list, snapshot.value);
			if (Array.isArray(snapshot.bonusWallets)) list.push.apply(list, snapshot.bonusWallets);
			let total = 0;
			let seen = false;
			for (const wallet of list) {
				if (!wallet || wallet.currency !== "CNY") continue;
				const amount = Number(wallet.balance);
				if (!Number.isFinite(amount)) continue;
				total += amount;
				seen = true;
			}
			return seen ? total : null;
		}

		function openUsage() {
			try {
				const opened = window.open(OPTIONS.usageUrl, "_blank", "noopener,noreferrer");
				if (!opened) window.location.assign(OPTIONS.usageUrl);
			}
			catch (error) { }
		}

		function withTimeout(promise, ms) {
			return new Promise((resolve, reject) => {
				const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
				promise.then((value) => {
					window.clearTimeout(timer);
					resolve(value);
				}, (error) => {
					window.clearTimeout(timer);
					reject(error);
				});
			});
		}

		function useBalance(ctx) {
			const [state, setState] = React.useState({ phase: "loading", total: null, code: "" });
			React.useEffect(() => {
				let stopped = false;

				const tick = async () => {
					const account = accountOf(ctx);
					if (!account) {
						if (!stopped) setState({ phase: "offline", total: null, code: "no-remote" });
						return;
					}
					try {
						const result = await withTimeout(account.getBalance(metadata(ctx)), 10000);
						if (stopped) return;
						if (!result) {
							setState({ phase: "failed", total: null, code: "no-result" });
							return;
						}
						if (result.ok !== true) {
							setState({ phase: "failed", total: null, code: "not-ok" });
							return;
						}
						const total = sumCny(result.value);
						if (total === null) {
							const inner = result.value && result.value.status ? "st=" + result.value.status : "no-wallet";
							setState({ phase: "failed", total: null, code: inner });
							return;
						}
						setState({ phase: "ready", total, code: "" });
					}
					catch (error) {
						const message = (error && error.message ? error.message : String(error)).slice(0, 24);
						console.error("[balance-bar] getBalance failed", error);
						if (!stopped) setState({ phase: "failed", total: null, code: message === "timeout" ? "timeout" : "err:" + message });
					}
				};

				tick();
				const timer = window.setInterval(tick, POLL_MS);
				const onFocus = () => { tick(); };
				window.addEventListener("focus", onFocus);
				return () => {
					stopped = true;
					window.clearInterval(timer);
					window.removeEventListener("focus", onFocus);
				};
			}, []);
			return state;
		}

		function makeBar(ctx) {
			return function BalanceBar() {
				const state = useBalance(ctx);
				const total = state.phase === "ready" ? state.total : null;
				const cap = total === null ? readCap() : raiseCap(total);
				const ratio = total === null ? 0 : Math.max(0, Math.min(1, total / cap));
				const low = total !== null && ratio < 0.2;

				const caption = total === null
					? (state.phase === "loading" ? "\u2026" : state.code || "\u2014") + " / " + cap
					: fmt(total) + " / " + cap;

				const fill = {
					width: (ratio * 100).toFixed(1) + "%",
					height: "100%",
					borderRadius: "3px",
					background: low
						? "linear-gradient(90deg, #ff7a7a, #f0433f)"
						: "linear-gradient(90deg, #ff8a8a, #e5484d)",
					transition: "width 400ms ease"
				};

				return h("div", {
					onClick: openUsage,
					role: "button",
					tabIndex: 0,
					title: "Click to open usage page",
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") openUsage();
					},
					style: {
						flex: "1 1 100%",
						minWidth: 0,
						padding: "6px 12px 8px",
						cursor: "pointer",
						userSelect: "none"
					}
				},
					h("div", {
						style: {
							display: "flex",
							alignItems: "baseline",
							justifyContent: "space-between",
							gap: "8px",
							fontSize: "11px",
							lineHeight: "16px",
							color: low ? "#e5484d" : "var(--dsh-text-secondary, #8a8f98)"
						}
					},
						h("span", { style: { fontWeight: 600 } }, OPTIONS.label),
						h("span", { style: { fontVariantNumeric: "tabular-nums" } }, caption)
					),
					h("div", {
						style: {
							marginTop: "4px",
							height: "6px",
							borderRadius: "3px",
							background: "var(--dsh-surface-3, #e6e8eb)",
							overflow: "hidden"
						}
					}, h("div", { style: fill }))
				);
			};
		}

		function fmt(value) {
			return value.toFixed(2);
		}

		const inject = ["slots", "remote.account"];

		function apply(ctx, config) {
			configure(config);
			const Component = makeBar(ctx);
			ctx.slots.inject("sidebar.footer.action", function* () {
				yield ctx.slots.register({
					name: "sidebar.footer.action",
					id: "dsh-balance-bar",
					order: 100
				}, Component);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

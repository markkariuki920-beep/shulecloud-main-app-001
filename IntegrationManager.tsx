import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getIntegrations,
  processSmsNow,
  saveIntegration,
  setIntegrationEnabled,
  testIntegration,
} from "@/lib/integrations.functions";

const emptyMpesa = {
  environment: "sandbox",
  shortcode: "",
  transaction_type: "CustomerPayBillOnline",
  party_b: "",
  account_reference: "SHULECLOUD",
  callback_base_url: "",
};
const emptySms = {
  provider: "africastalking",
  environment: "sandbox",
  username: "",
  sender_id: "",
  account_sid: "",
  from_number: "",
};
const emptySecrets = {
  consumer_key: "",
  consumer_secret: "",
  passkey: "",
  api_key: "",
  auth_token: "",
};
type MpesaFields = typeof emptyMpesa;
type SmsFields = typeof emptySms;
type SecretFields = typeof emptySecrets;
const asStrings = (config: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v ?? "")]));

function Field({
  label,
  value,
  onChange,
  secret = false,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        type={secret ? "password" : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
        autoComplete={secret ? "new-password" : "off"}
      />
    </label>
  );
}

export function IntegrationManager() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["platform-integrations"], queryFn: () => getIntegrations() });
  const [mpesa, setMpesa] = useState<MpesaFields>(emptyMpesa);
  const [sms, setSms] = useState<SmsFields>(emptySms);
  const [secrets, setSecrets] = useState<SecretFields>(emptySecrets);
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setMpesa((old) => ({
      ...old,
      ...(asStrings(query.data.mpesa.config) as Partial<MpesaFields>),
    }));
    setSms((old) => ({ ...old, ...(asStrings(query.data.sms.config) as Partial<SmsFields>) }));
  }, [query.data]);

  const update = <T extends Record<string, string>>(
    setter: (v: T) => void,
    old: T,
    key: keyof T,
    value: string,
  ) => setter({ ...old, [key]: value });

  async function saveMpesa() {
    setBusy(true);
    try {
      const result = await saveIntegration({
        data: {
          provider: "mpesa",
          config: {
            environment: mpesa.environment as "sandbox" | "production",
            shortcode: mpesa.shortcode,
            transaction_type: mpesa.transaction_type as
              "CustomerPayBillOnline" | "CustomerBuyGoodsOnline",
            party_b: mpesa.party_b,
            account_reference: mpesa.account_reference,
            callback_base_url: mpesa.callback_base_url,
          },
          secrets: {
            consumer_key: secrets.consumer_key,
            consumer_secret: secrets.consumer_secret,
            passkey: secrets.passkey,
          },
        },
      });
      toast.success(
        result.missing.length
          ? `Saved. Still required: ${result.missing.join(", ")}`
          : "M-Pesa settings saved. Test before enabling.",
      );
      setSecrets((s) => ({ ...s, consumer_key: "", consumer_secret: "", passkey: "" }));
      await qc.invalidateQueries({ queryKey: ["platform-integrations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSms() {
    setBusy(true);
    try {
      const result = await saveIntegration({
        data: {
          provider: "sms",
          config: {
            provider: sms.provider as "africastalking" | "twilio",
            environment: sms.environment as "sandbox" | "production",
            username: sms.username,
            sender_id: sms.sender_id,
            account_sid: sms.account_sid,
            from_number: sms.from_number,
          },
          secrets: { api_key: secrets.api_key, auth_token: secrets.auth_token },
        },
      });
      toast.success(
        result.missing.length
          ? `Saved. Still required: ${result.missing.join(", ")}`
          : "SMS settings saved. Send a test before enabling.",
      );
      setSecrets((s) => ({ ...s, api_key: "", auth_token: "" }));
      await qc.invalidateQueries({ queryKey: ["platform-integrations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test(provider: "mpesa" | "sms") {
    setBusy(true);
    try {
      const result = await testIntegration({
        data: { provider, ...(provider === "sms" ? { phone: testPhone } : {}) },
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await qc.invalidateQueries({ queryKey: ["platform-integrations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(provider: "mpesa" | "sms", enabled: boolean) {
    setBusy(true);
    try {
      await setIntegrationEnabled({ data: { provider, enabled } });
      toast.success(
        `${provider === "mpesa" ? "M-Pesa" : "SMS"} ${enabled ? "enabled" : "disabled"}`,
      );
      await qc.invalidateQueries({ queryKey: ["platform-integrations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading)
    return (
      <section>
        <h2 className="text-lg font-semibold">Payment and SMS integrations</h2>
        <p className="text-sm text-muted-foreground">Loading protected integration settings…</p>
      </section>
    );
  if (query.error || !query.data)
    return (
      <section>
        <h2 className="text-lg font-semibold">Payment and SMS integrations</h2>
        <p className="text-sm text-destructive">
          Could not load integration settings. Check server encryption configuration and database
          migration.
        </p>
      </section>
    );
  const data = query.data;
  const secret = (key: keyof SecretFields, label: string) => (
    <Field
      key={key}
      label={`${label}${secrets[key] ? " (new value)" : ""}`}
      secret
      value={secrets[key] ?? ""}
      onChange={(v) => setSecrets((s) => ({ ...s, [key]: v }))}
      placeholder={
        data.mpesa.hints[key] || data.sms.hints[key]
          ? `Saved: ${data.mpesa.hints[key] || data.sms.hints[key]}`
          : "Enter secret (stored encrypted)"
      }
    />
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Payment and SMS integrations</h2>
        <p className="text-sm text-muted-foreground">
          Credentials are sent to protected server functions and encrypted before storage. Saving
          changes disables that provider until it passes a new test.
        </p>
        {!data.keyReady && (
          <p className="mt-2 text-sm text-destructive">
            INTEGRATIONS_ENCRYPTION_KEY is missing on the server. Configure it before saving
            credentials.
          </p>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Safaricom M-Pesa Daraja</h3>
            <span className="text-xs text-muted-foreground">
              {data.mpesa.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Environment</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={mpesa.environment}
                onChange={(e) => update(setMpesa, mpesa, "environment", e.target.value)}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </label>
            <Field
              label="Business shortcode"
              value={mpesa.shortcode}
              onChange={(v) => update(setMpesa, mpesa, "shortcode", v)}
            />
            <label className="space-y-1 text-sm">
              <span className="font-medium">Transaction type</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={mpesa.transaction_type}
                onChange={(e) => update(setMpesa, mpesa, "transaction_type", e.target.value)}
              >
                <option value="CustomerPayBillOnline">PayBill</option>
                <option value="CustomerBuyGoodsOnline">Buy Goods</option>
              </select>
            </label>
            <Field
              label="Till / Party B (optional)"
              value={mpesa.party_b}
              onChange={(v) => update(setMpesa, mpesa, "party_b", v)}
            />
            <Field
              label="Account reference"
              value={mpesa.account_reference}
              onChange={(v) => update(setMpesa, mpesa, "account_reference", v)}
            />
            <Field
              label="Public HTTPS callback base URL"
              value={mpesa.callback_base_url}
              onChange={(v) => update(setMpesa, mpesa, "callback_base_url", v)}
              placeholder="https://your-domain.example"
            />
            {secret("consumer_key", "Consumer key")}
            {secret("consumer_secret", "Consumer secret")}
            {secret("passkey", "Lipa Na M-Pesa passkey")}
          </div>
          <p className="text-xs text-muted-foreground">
            Callback URL must be publicly reachable over HTTPS. Use sandbox credentials for testing;
            production needs Safaricom approval.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveMpesa} disabled={busy || !data.keyReady}>
              Save M-Pesa
            </Button>
            <Button variant="outline" onClick={() => test("mpesa")} disabled={busy}>
              Test connection
            </Button>
            <Button
              variant="outline"
              onClick={() => toggle("mpesa", !data.mpesa.enabled)}
              disabled={busy || !data.mpesa.verifiedAt}
            >
              {data.mpesa.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Last check: {data.mpesa.lastCheck ?? "Never"}
          </p>
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">SMS notifications</h3>
            <span className="text-xs text-muted-foreground">
              {data.sms.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Provider</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={sms.provider}
                onChange={(e) => update(setSms, sms, "provider", e.target.value)}
              >
                <option value="africastalking">Africa's Talking</option>
                <option value="twilio">Twilio</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Environment</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={sms.environment}
                onChange={(e) => update(setSms, sms, "environment", e.target.value)}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </label>
            <Field
              label="Africa's Talking username"
              value={sms.username}
              onChange={(v) => update(setSms, sms, "username", v)}
            />
            <Field
              label="Sender ID (optional)"
              value={sms.sender_id}
              onChange={(v) => update(setSms, sms, "sender_id", v)}
            />
            <Field
              label="Twilio Account SID"
              value={sms.account_sid}
              onChange={(v) => update(setSms, sms, "account_sid", v)}
            />
            <Field
              label="Twilio sender number"
              value={sms.from_number}
              onChange={(v) => update(setSms, sms, "from_number", v)}
            />
            {secret("api_key", "SMS API key")}
            {secret("auth_token", "Twilio auth token")}
          </div>
          <Field
            label="Test recipient (Kenyan mobile)"
            value={testPhone}
            onChange={setTestPhone}
            placeholder="07XXXXXXXX or 2547XXXXXXXX"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveSms} disabled={busy || !data.keyReady}>
              Save SMS
            </Button>
            <Button variant="outline" onClick={() => test("sms")} disabled={busy}>
              Send test SMS
            </Button>
            <Button
              variant="outline"
              onClick={() => toggle("sms", !data.sms.enabled)}
              disabled={busy || !data.sms.verifiedAt}
            >
              {data.sms.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await processSmsNow();
                  toast.success(`SMS queue processed: ${r.sent} sent, ${r.failed} failed.`);
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || !data.sms.enabled}
            >
              Process queued SMS
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Last check: {data.sms.lastCheck ?? "Never"}
          </p>
        </div>
      </div>
    </section>
  );
}

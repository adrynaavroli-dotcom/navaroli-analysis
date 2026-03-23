import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ThesisData {
  id: string;
  user_id: string;
  ticker: string;
  company_name: string;
  fair_value: number | null;
  current_price: number | null;
  price_at_last_check: number | null;
  updated_at: string;
  last_alert_sent_at: string | null;
  needs_review: boolean;
  published_at: string | null;
  alert_type: string | null;
}

interface ThesisUpdate {
  last_alert_sent_at?: string;
  alert_type?: string;
  needs_review?: boolean;
  price_at_last_check?: number;
}

interface Alert {
  thesis_id: string;
  user_id: string;
  alert_type: string;
  ticker: string;
  message: string;
}

const PRICE_DROP_THRESHOLD = 0.10; // 10%
const REVIEW_MONTHS = 6;
const MIN_ALERT_INTERVAL_HOURS = 24; // Don't spam alerts

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorization: require CRON_SECRET header or valid admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");

    let authorized = false;

    // Check cron secret
    if (expectedSecret && cronSecret === expectedSecret) {
      authorized = true;
    }

    // Fallback: check for admin JWT
    if (!authorized) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const authClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user } } = await authClient.auth.getUser(token);
        if (user) {
          // Check admin role
          const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const { data: hasRole } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
          if (hasRole) authorized = true;
        }
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // Fetch all published theses
    const { data: theses, error: thesesError } = await supabase
      .from("public_thesis_data")
      .select("*")
      .not("published_at", "is", null);

    if (thesesError) throw thesesError;

    const alerts: Alert[] = [];
    const updates: { id: string; updates: ThesisUpdate }[] = [];

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - REVIEW_MONTHS);

    for (const thesis of theses as ThesisData[]) {
      const lastAlertTime = thesis.last_alert_sent_at 
        ? new Date(thesis.last_alert_sent_at) 
        : null;
      
      const hoursSinceLastAlert = lastAlertTime 
        ? (now.getTime() - lastAlertTime.getTime()) / (1000 * 60 * 60)
        : Infinity;

      // Skip if we've alerted recently
      if (hoursSinceLastAlert < MIN_ALERT_INTERVAL_HOURS) continue;

      // Check 1: Fair value reached
      if (thesis.fair_value && thesis.current_price && 
          thesis.current_price >= thesis.fair_value) {
        alerts.push({
          thesis_id: thesis.id,
          user_id: thesis.user_id,
          alert_type: "fair_value_reached",
          ticker: thesis.ticker,
          message: `${thesis.ticker} (${thesis.company_name}) ha alcanzado tu fair value de $${thesis.fair_value.toFixed(2)}. Precio actual: $${thesis.current_price.toFixed(2)}`,
        });
        updates.push({
          id: thesis.id,
          updates: { 
            last_alert_sent_at: now.toISOString(),
            alert_type: "fair_value_reached"
          }
        });
      }

      // Check 2: Significant price drop (>10%)
      if (thesis.price_at_last_check && thesis.current_price) {
        const priceChange = (thesis.current_price - thesis.price_at_last_check) / thesis.price_at_last_check;
        if (priceChange <= -PRICE_DROP_THRESHOLD) {
          const dropPercent = Math.abs(priceChange * 100).toFixed(1);
          alerts.push({
            thesis_id: thesis.id,
            user_id: thesis.user_id,
            alert_type: "price_drop",
            ticker: thesis.ticker,
            message: `${thesis.ticker} (${thesis.company_name}) ha caído un ${dropPercent}% desde tu última revisión. Precio anterior: $${thesis.price_at_last_check.toFixed(2)}, Actual: $${thesis.current_price.toFixed(2)}`,
          });
          updates.push({
            id: thesis.id,
            updates: { 
              last_alert_sent_at: now.toISOString(),
              alert_type: "price_drop"
            }
          });
        }
      }

      // Check 3: Needs review (6 months without update)
      const lastUpdated = new Date(thesis.updated_at);
      if (lastUpdated < sixMonthsAgo && !thesis.needs_review) {
        alerts.push({
          thesis_id: thesis.id,
          user_id: thesis.user_id,
          alert_type: "needs_review",
          ticker: thesis.ticker,
          message: `${thesis.ticker} (${thesis.company_name}) no ha sido actualizado en más de 6 meses. Última actualización: ${lastUpdated.toLocaleDateString("es-ES")}`,
        });
        updates.push({
          id: thesis.id,
          updates: { 
            needs_review: true,
            last_alert_sent_at: now.toISOString(),
            alert_type: "needs_review"
          }
        });
      }

      // Update price_at_last_check for next comparison
      if (thesis.current_price && thesis.current_price !== thesis.price_at_last_check) {
        const existingUpdate = updates.find(u => u.id === thesis.id);
        if (existingUpdate) {
          existingUpdate.updates.price_at_last_check = thesis.current_price;
        } else {
          updates.push({
            id: thesis.id,
            updates: { price_at_last_check: thesis.current_price }
          });
        }
      }
    }

    // Insert alerts into database
    if (alerts.length > 0) {
      const { error: alertInsertError } = await supabase
        .from("thesis_alerts")
        .insert(alerts);

      if (alertInsertError) {
        console.error("Error inserting alerts:", alertInsertError);
      }
    }

    // Apply updates to theses
    for (const { id, updates: thesisUpdates } of updates) {
      await supabase
        .from("public_thesis_data")
        .update(thesisUpdates)
        .eq("id", id);
    }

    // Send email notifications if Resend is configured
    if (resend && alerts.length > 0) {
      // Get user emails
      const userIds = [...new Set(alerts.map(a => a.user_id))];
      
      for (const userId of userIds) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("notification_email, full_name")
          .eq("user_id", userId)
          .single();

        if (!profile?.notification_email) continue;

        const userAlerts = alerts.filter(a => a.user_id === userId);
        
        const alertsHtml = userAlerts.map(a => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; font-weight: 600;">${a.ticker}</td>
            <td style="padding: 12px;">
              <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; 
                background: ${a.alert_type === 'fair_value_reached' ? '#dcfce7' : a.alert_type === 'price_drop' ? '#fee2e2' : '#fef3c7'};
                color: ${a.alert_type === 'fair_value_reached' ? '#166534' : a.alert_type === 'price_drop' ? '#991b1b' : '#92400e'};">
                ${a.alert_type === 'fair_value_reached' ? '🎯 Fair Value' : a.alert_type === 'price_drop' ? '📉 Caída' : '⏰ Revisión'}
              </span>
            </td>
            <td style="padding: 12px;">${a.message}</td>
          </tr>
        `).join("");

        try {
          await resend.emails.send({
            from: "Alertas Research <onboarding@resend.dev>",
            to: [profile.notification_email],
            subject: `📊 ${userAlerts.length} alerta(s) en tus tesis de inversión`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #111827; font-size: 24px; margin-bottom: 8px;">Alertas de Research</h1>
                <p style="color: #6b7280; margin-bottom: 24px;">Hola ${profile.full_name || 'Analista'},</p>
                <p style="color: #374151; margin-bottom: 16px;">Se han detectado ${userAlerts.length} alerta(s) en tus tesis publicadas:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                  <thead>
                    <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                      <th style="padding: 12px; text-align: left; color: #374151;">Ticker</th>
                      <th style="padding: 12px; text-align: left; color: #374151;">Tipo</th>
                      <th style="padding: 12px; text-align: left; color: #374151;">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${alertsHtml}
                  </tbody>
                </table>

                <p style="color: #6b7280; font-size: 14px;">
                  Revisa tus análisis en el panel de administración para tomar acción.
                </p>
              </div>
            `,
          });

          // Mark alerts as email sent
          for (const alert of userAlerts) {
            await supabase
              .from("thesis_alerts")
              .update({ email_sent: true })
              .eq("thesis_id", alert.thesis_id)
              .eq("alert_type", alert.alert_type)
              .eq("acknowledged", false);
          }
        } catch (emailError) {
          console.error("Error sending email:", emailError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        alertsGenerated: alerts.length,
        thesesChecked: theses?.length || 0
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: unknown) {
    console.error("Error in check-thesis-alerts:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

import { ImageResponse } from "next/og";

import { BRAND_LOGO_PNG } from "@/lib/brand-logo-png";
import { COMPANY } from "@/lib/constants";

/**
 * The card that appears when somebody pastes a Target Express link.
 *
 * There was none, so every tracking link forwarded on WhatsApp — which is how
 * this business actually reaches its customers — arrived as a bare grey URL.
 * The logo exists; the one place it was most visible to people who are not yet
 * customers had nothing on it at all.
 *
 * Generated at build time from the same artwork everything else uses, so it
 * cannot drift from the mark in the header.
 */

export const alt = `${COMPANY.name} — air cargo from China to Tanzania`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0B1220 0%, #182A48 62%, #24406F 100%)",
          padding: 64,
        }}
      >
        {/* The brand rule, in the proportion the logo uses its two inks. */}
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0 }}>
          <div style={{ width: 300, height: 12, background: "#D81E2A" }} />
          <div style={{ width: 900, height: 12, background: "#4B7FD1" }} />
        </div>

        {/* The lockup sits on white: its "Express Air Cargo" is navy ink, and
            navy on navy is a hole in the card. */}
        <div
          style={{
            display: "flex",
            background: "#fff",
            borderRadius: 20,
            padding: "22px 30px",
            alignSelf: "flex-start",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO_PNG} width={330} height={136} alt="" />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 62,
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1.1,
              letterSpacing: -1.5,
            }}
          >
            Air cargo from China to Tanzania
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 30,
              color: "#AFC3E4",
            }}
          >
            Guangzhou · Hong Kong — Dar es Salaam · {COMPANY.promiseDays} days
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            paddingTop: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              color: "#FF6B72",
              letterSpacing: 2,
            }}
          >
            KWETU MUDA NI MALI
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#8FA6CC" }}>
            {COMPANY.phone}
          </div>
        </div>
      </div>
    ),
    size
  );
}

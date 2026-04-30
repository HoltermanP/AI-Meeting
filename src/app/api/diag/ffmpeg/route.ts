import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stat, chmod } from "fs/promises";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

export const maxDuration = 30;

/**
 * Diagnose-endpoint: verifieert of ffmpeg-static op de Vercel-function aanwezig is
 * en uitvoerbaar. Beveiligd achter login zodat 't niet zomaar iedereen kan triggeren.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const path = ffmpegStatic || "ffmpeg";
  const result: Record<string, unknown> = { path, ffmpegStaticImport: ffmpegStatic };

  try {
    const s = await stat(path);
    result.exists = true;
    result.size = s.size;
    result.mode = s.mode.toString(8);
    await chmod(path, 0o755).catch((e) => {
      result.chmodError = String(e);
    });
  } catch (err) {
    result.exists = false;
    result.statError = String(err);
    return NextResponse.json(result, { status: 500 });
  }

  const versionResult = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const ff = spawn(path, ["-version"]);
      let out = "";
      let err = "";
      ff.stdout?.on("data", (d) => (out += d.toString()));
      ff.stderr?.on("data", (d) => (err += d.toString()));
      ff.on("close", (c) => resolve({ code: c, stdout: out, stderr: err }));
      ff.on("error", (e) => resolve({ code: -1, stdout: out, stderr: `spawn-error: ${e.message}\n${err}` }));
    }
  );

  result.execCode = versionResult.code;
  result.versionLine = versionResult.stdout.split("\n")[0] || versionResult.stderr.split("\n")[0];
  if (versionResult.code !== 0) {
    result.stderr = versionResult.stderr.slice(0, 1000);
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...result });
}

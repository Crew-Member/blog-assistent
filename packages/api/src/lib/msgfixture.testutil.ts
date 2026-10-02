import CFB from "cfb";

const u16 = (s: string) => Buffer.from(s, "utf16le");

/** Baut eine minimale Outlook-.msg (MAPI-Streams in einem OLE-Container) fuer Tests. */
export function buildMsg(opts: { subject: string; body: string; sender?: string; attachments?: { name: string; data: Buffer }[] }): Buffer {
  const cfb = CFB.utils.cfb_new();
  const add = (path: string, content: Buffer) => CFB.utils.cfb_add(cfb, path, content);
  add("/__properties_version1.0", Buffer.alloc(32));
  add("/__substg1.0_0037001F", u16(opts.subject)); // PidTagSubject
  add("/__substg1.0_1000001F", u16(opts.body)); // PidTagBody
  if (opts.sender) add("/__substg1.0_0C1A001F", u16(opts.sender)); // PidTagSenderName
  (opts.attachments ?? []).forEach((att, i) => {
    const dir = `/__attach_version1.0_#${String(i).padStart(8, "0")}`;
    add(`${dir}/__properties_version1.0`, Buffer.alloc(8));
    add(`${dir}/__substg1.0_3707001F`, u16(att.name)); // PidTagAttachLongFilename
    add(`${dir}/__substg1.0_3704001F`, u16(att.name)); // PidTagAttachFilename
    add(`${dir}/__substg1.0_37010102`, att.data); // PidTagAttachDataBinary
  });
  return Buffer.from(CFB.write(cfb, { type: "buffer" }) as Uint8Array);
}


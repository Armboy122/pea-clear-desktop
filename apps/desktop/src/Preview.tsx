import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentKind, ExportFiles, Trip } from '@pea/contracts';
import type { PersonCalculation } from '@pea/core';
import { documentPageCount, renderDocument } from '../../../packages/core/src/html-templates';
import { fitTravelPlaces } from '../../../packages/core/src/print-layout';
import assets from './generated-print-assets.json';
import { Icon } from './components';

const pixelsPerMm = 96 / 25.4;
const dimensions = {
  clear: { width: 297, height: 210, pages: 2, title: 'ใบเคลีย', layout: 'A4 แนวนอน' },
  budget: { width: 210, height: 297, pages: 1, title: 'ใบตัดงบ', layout: 'A4 แนวตั้ง' },
};

export function Preview({ trip, people }: { trip: Trip; people: PersonCalculation[] }) {
  const [personId, setPersonId] = useState('');
  const [kind, setKind] = useState<DocumentKind>('clear');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const canvas = useRef<HTMLDivElement>(null);
  const person = people.find((item) => item.member.id === personId) ?? people[0];
  const deferredTrip = useDeferredValue(trip);
  const deferredPerson = useDeferredValue(person);
  const html = useMemo(() => {
    if (!deferredPerson) return '';
    const documentDate = deferredTrip.documentDate || deferredTrip.travelSegments.at(-1)?.arriveDate || '';
    return renderDocument(kind, { ...deferredTrip, documentDate }, [deferredPerson], assets);
  }, [kind, deferredTrip, deferredPerson]);

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { canvas.current?.scrollTo(0, 0); }, [kind, person?.member.id]);

  const size = dimensions[kind];
  const pages = person ? documentPageCount(kind, [person]) : size.pages;
  const pageWidth = Math.ceil(size.width * pixelsPerMm);
  const pageHeight = Math.ceil(size.height * pixelsPerMm);
  const documentHeight = Math.ceil((size.height * pages + (pages - 1) * 5) * pixelsPerMm) + 1;
  const fit = viewport.width && viewport.height ? Math.min(viewport.width / pageWidth, viewport.height / pageHeight, 1) : 0.35;
  const scale = zoom === 'fit' ? fit : zoom;
  const zoomBy = (delta: number) => setZoom(Math.max(0.1, Math.min(2, Math.round((scale + delta) * 100) / 100)));

  return (
    <section className="proof" aria-labelledby="preview-heading">
      <header className="proof-heading">
        <div><span className="eyebrow">PRINT PROOF</span><h2 id="preview-heading">ตัวอย่างก่อนพิมพ์</h2></div>
        <Icon name="file" />
      </header>
      <div className="proof-controls">
        <div className="doc-switch" aria-label="ประเภทเอกสาร">
          <button type="button" aria-pressed={kind === 'clear'} onClick={() => setKind('clear')}>ใบเคลีย</button>
          <button type="button" aria-pressed={kind === 'budget'} onClick={() => setKind('budget')}>ใบตัดงบ</button>
        </div>
        <select value={person?.member.id ?? ''} aria-label="ผู้ร่วมเดินทางในตัวอย่าง" disabled={!people.length}
          onChange={(event) => setPersonId(event.target.value)}>
          {!people.length && <option value="">เลือกผู้ร่วมเดินทาง</option>}
          {people.map(({ member }) => <option key={member.id} value={member.id}>{member.nickname} · {member.name}</option>)}
        </select>
      </div>
      <div className="proof-canvas" ref={canvas} tabIndex={person ? 0 : undefined} aria-label="พื้นที่แสดงหน้ากระดาษ">
        {person && html ? (
          <div className="paper-frame" style={{ width: pageWidth * scale, height: documentHeight * scale }}>
            <iframe title={size.title + 'ของ ' + person.member.name} sandbox="allow-same-origin" srcDoc={html}
              onLoad={({ currentTarget }) => {
                const document = currentTarget.contentDocument;
                if (document) void fitTravelPlaces(document);
              }}
              style={{ width: pageWidth, height: documentHeight, transform: 'scale(' + scale + ')' }} />
          </div>
        ) : (
          <div className="proof-empty">
            <div className="ghost-page" aria-hidden="true"><span>PEA</span><i /><i /><i /><i /></div>
            <strong>ยังไม่มีเอกสารให้ดู</strong>
            <span>เลือกผู้ร่วมเดินทางเพื่อดูใบเคลียและใบตัดงบ</span>
          </div>
        )}
      </div>
      <footer className="proof-footer">
        <span>{size.layout} · {pages} หน้า</span>
        <div className="zoom">
          <button type="button" className="icon-button" onClick={() => zoomBy(-0.1)} disabled={!person || scale <= 0.1} aria-label="ย่อตัวอย่าง"><Icon name="minus" /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" className="icon-button" onClick={() => zoomBy(0.1)} disabled={!person || scale >= 2} aria-label="ขยายตัวอย่าง"><Icon name="plus" /></button>
          <button type="button" className="icon-button" onClick={() => setZoom('fit')} disabled={!person} aria-label="พอดีพื้นที่" aria-pressed={zoom === 'fit'}><Icon name="fit" /></button>
        </div>
      </footer>
    </section>
  );
}

export function ExportDesk({ exportRoot, files, busy, isExporting, canExport, onChoose, onExport, onOpen }: {
  exportRoot: string;
  files?: ExportFiles;
  busy: boolean;
  isExporting: boolean;
  canExport: boolean;
  onChoose: () => void;
  onExport: () => void;
  onOpen: (folder: string) => void;
}) {
  return (
    <section className="export-desk" aria-labelledby="export-heading">
      <header><div><span className="eyebrow">EXPORT</span><h2 id="export-heading">ส่งออกชุดเอกสาร</h2></div><span className="format">PDF + XLSX</span></header>
      <div className="export-path">
        <Icon name="folder" />
        <span title={exportRoot}>{exportRoot || 'กำลังอ่านโฟลเดอร์ปลายทาง'}</span>
        <button type="button" className="text-button" onClick={onChoose} disabled={busy}>เปลี่ยน</button>
      </div>
      <button className="button primary export-button" type="button" onClick={onExport} disabled={busy || !canExport}>
        <Icon name="download" />{isExporting ? 'กำลังสร้างเอกสาร…' : 'ส่งออก PDF และ XLSX'}
      </button>
      {files && (
        <div className="export-result">
          <div><Icon name="check" /><strong>ส่งออกแล้ว 3 ไฟล์</strong></div>
          <ul>{[files.clear, files.budget, files.workbook].map((file) => <li key={file}>{file.split('/').at(-1)}</li>)}</ul>
          <button type="button" className="text-button" onClick={() => onOpen(files.folder)} disabled={busy}>เปิดโฟลเดอร์ใน Finder <Icon name="arrow" /></button>
        </div>
      )}
    </section>
  );
}

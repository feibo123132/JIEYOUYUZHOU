import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { jsx } from 'react/jsx-runtime';
import { createPortal } from 'react-dom';
import { PawPrint, X } from 'lucide-react';
import { initNotify, makePetConfigSection, makePetUI, zh } from '../../../vendor/dsh-pet/client';
import { updatePetGame } from '../../../vendor/dsh-pet/browserHost';
import type { ListeningGameRoom } from './listeningGame';
import { createPetSound, getPetSoundPair, petSoundFiles, readPetSoundSettings, savePetSoundSettings, type PetSoundSettings } from './listeningGamePetSound';
import './listeningGamePet.css';

const PetOverlay = makePetUI({ h: jsx, useState, useEffect, useRef });
const PetSettings = makePetConfigSection({
  h: jsx,
  useState,
  useEffect,
  useRef,
  useCallback,
  t: (key: string) => zh[key] ?? key,
});

export default function ListeningGamePet({ room }: { room: ListeningGameRoom | null }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState(readPetSoundSettings);
  const [soundStatus, setSoundStatus] = useState('');
  const [importingSound, setImportingSound] = useState(false);
  const [petSound] = useState(createPetSound);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const phase = room?.phase ?? 'waiting';
  const roundId = room?.roundId ?? null;
  const submissions = room?.submissionCount ?? 0;
  const soundPair = getPetSoundPair(soundSettings);

  useEffect(() => initNotify(), []);
  useEffect(() => petSound.dispose, [petSound]);
  useEffect(() => {
    updatePetGame(phase, roundId, submissions);
  }, [phase, roundId, submissions]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!settingsOpen || !dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [settingsOpen]);

  const closeSettings = () => setSettingsOpen(false);
  function updateSoundSettings(settings: PetSoundSettings) {
    try {
      savePetSoundSettings(settings);
      setSoundSettings(settings);
      setSoundStatus('');
    } catch {
      setSoundStatus('当前浏览器无法保存音效设置。');
    }
  }

  async function importSounds(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length) return;
    setImportingSound(true);
    setSoundStatus('');
    try {
      const imported = await petSound.importFiles(files);
      const settings = { ...soundSettings, files: { ...soundSettings.files, ...imported } };
      if (settings.preset !== 'muted' && !getPetSoundPair(settings)) {
        const otherPreset = settings.preset === 'duck' ? 'pop' : 'duck';
        if (getPetSoundPair({ ...settings, preset: otherPreset })) settings.preset = otherPreset;
      }
      updateSoundSettings(settings);
    } catch (error) {
      setSoundStatus(error instanceof Error ? error.message : '导入失败，请重新选择音频。');
    } finally {
      setImportingSound(false);
    }
  }
  return <>
    <button
      type="button"
      onClick={() => setSettingsOpen(true)}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white"
      aria-haspopup="dialog"
    >
      <PawPrint className="h-4 w-4" aria-hidden="true" /> 桌宠
    </button>
    {createPortal(<>
      <PetOverlay sound={{
        press: (pointerId: number) => petSound.press(pointerId, soundPair),
        release: petSound.release,
      }} />
      {settingsOpen && <dialog
        ref={dialogRef}
        aria-labelledby="listening-game-pet-settings"
        className="listening-game-pet-settings"
        onCancel={event => {
          event.preventDefault();
          closeSettings();
        }}
      >
        <header className="listening-game-pet-settings__header">
          <div>
            <h2 id="listening-game-pet-settings">桌宠配置</h2>
            <p>设置保存在当前浏览器。桌面窗口、模型对话与余额服务需要 DSH 宿主。</p>
          </div>
          <button type="button" aria-label="关闭桌宠配置" onClick={closeSettings}>
            <X className="h-5 w-5" />
          </button>
        </header>
        <fieldset className="listening-game-pet-settings__sound" disabled={importingSound}>
          <label>
            <span>按压音效</span>
            <select value={soundSettings.preset} onChange={event => updateSoundSettings({
              ...soundSettings,
              preset: event.target.value as PetSoundSettings['preset'],
            })}>
              <option value="duck">小黄鸭</option>
              <option value="pop">音效1</option>
              <option value="muted">静音</option>
            </select>
          </label>
          <input
            type="file"
            aria-label="导入按压音效"
            accept=".mp3,audio/mpeg"
            multiple
            onChange={importSounds}
          />
          <p role="status">
            {soundStatus || (importingSound ? '正在读取音频…' :
              soundSettings.preset === 'muted' ? '已静音' :
              soundPair ? '使用已导入的原音频 · 音量 90%' :
              `请从 dsh-whale-widget 导入 ${petSoundFiles[soundSettings.preset].join(' 和 ')}。`)}
          </p>
        </fieldset>
        <PetSettings close={closeSettings} />
        <p className="listening-game-pet-settings__credit">
          <a href="https://github.com/PC2005-cloud/dsh-pet" target="_blank" rel="noreferrer">dsh-pet v0.3.8 · PC2005-cloud</a>
        </p>
      </dialog>}
    </>, document.body)}
  </>;
}

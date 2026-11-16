import React, { useState, useEffect, useRef } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Landmark,
  Camera,
  Trash2,
  ShieldCheck,
  Loader2,
  Palette,
  Sun,
  Moon,
  Monitor,
  Users,
  Plus,
  Pencil,
  MessageCircle,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { useTheme, ThemeMode } from '../ThemeContext';
import { BankCard } from './BankCard';
import {
  compressImage,
  formatWhatsAppUrl,
  generateId,
  getInitials,
  translateErrorToIndonesian,
  validateWhatsAppNumber,
} from '../utils';
import { OrganizationContact } from '../types';
import { Icon3D } from './Icon3D';

export const Settings: React.FC = () => {
  const {
    currentUser,
    isOnline,
    residents,
    bankAccount,
    updateBankAccount,
    organizationContacts,
    updateOrganizationContacts,
    updateProfilePhoto,
    updateOwnPassword,
  } = useAppContext();
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const shouldReduceMotion = useReducedMotion();

  const isAdmin = currentUser?.role === 'admin';

  const currentResident = currentUser?.role === 'resident'
    ? residents.find(r => r.userId === currentUser?.uid || r.id === currentUser?.residentId)
    : null;

  const accountNameDisplay = isAdmin
    ? (currentUser?.name || 'Admin Paguyuban')
    : (currentResident?.name || currentUser?.name || currentUser?.email || 'Warga Grand Hannan');

  const profilePhoto = currentUser?.photoUrl || currentResident?.photoUrl;

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [photoError, setPhotoError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Organization / Penanggung Jawab State (Admin edits, everyone views & clicks WA)
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [orgForm, setOrgForm] = useState({ name: '', roleTitle: '', whatsapp: '' });
  const [orgFormError, setOrgFormError] = useState('');
  const [orgFeedback, setOrgFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);

  // Bank Account State
  const [bankName, setBankName] = useState(bankAccount.bankName);
  const [accountNumber, setAccountNumber] = useState(bankAccount.accountNumber);
  const [accountName, setAccountName] = useState(bankAccount.accountName);
  const [bankMessage, setBankMessage] = useState('');
  const [bankError, setBankError] = useState('');
  const [isSavingBank, setIsSavingBank] = useState(false);

  useEffect(() => {
    setBankName(bankAccount.bankName);
    setAccountNumber(bankAccount.accountNumber);
    setAccountName(bankAccount.accountName);
  }, [bankAccount]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Ukuran foto maksimal 5MB.');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    setPhotoError('');
    setPhotoMessage('');
    setIsUpdatingPhoto(true);
    try {
      const compressed = await compressImage(file, 400, 0.8);
      await updateProfilePhoto(compressed);
      setPhotoMessage('Foto profil berhasil diperbarui.');
      setTimeout(() => setPhotoMessage(''), 3000);
    } catch (err: unknown) {
      setPhotoError(translateErrorToIndonesian(err, 'Gagal mengunggah foto profil.'));
    } finally {
      setIsUpdatingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoError('');
    setPhotoMessage('');
    setIsUpdatingPhoto(true);
    try {
      await updateProfilePhoto(null);
      setPhotoMessage('Foto profil berhasil dihapus.');
      setTimeout(() => setPhotoMessage(''), 3000);
    } catch (err: unknown) {
      setPhotoError(translateErrorToIndonesian(err, 'Gagal menghapus foto profil.'));
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (newPassword.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }

    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      await updateOwnPassword(newPassword);
      setMessage('Password berhasil diperbarui dan disinkronkan.');
      setNewPassword('');
    } catch (err: unknown) {
      setError(translateErrorToIndonesian(err, 'Gagal mengganti password.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError('');
    setBankMessage('');
    setIsSavingBank(true);
    try {
      await updateBankAccount({
        bankName,
        accountNumber,
        accountName,
      });
      setBankMessage('Informasi rekening berhasil diperbarui di cloud.');
      setTimeout(() => setBankMessage(''), 3000);
    } catch (err: unknown) {
      setBankError(translateErrorToIndonesian(err, 'Gagal memperbarui rekening pembayaran.'));
    } finally {
      setIsSavingBank(false);
    }
  };

  const openAddOrgModal = () => {
    if (!isAdmin) return;
    setEditingOrgId(null);
    setOrgForm({ name: '', roleTitle: '', whatsapp: '' });
    setOrgFormError('');
    setIsOrgModalOpen(true);
  };

  const openEditOrgModal = (contact: OrganizationContact) => {
    if (!isAdmin) return;
    setEditingOrgId(contact.id);
    setOrgForm({
      name: contact.name,
      roleTitle: contact.roleTitle,
      whatsapp: contact.whatsapp,
    });
    setOrgFormError('');
    setIsOrgModalOpen(true);
  };

  const handleSaveOrgContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || isSavingOrg) return;

    const cleanName = orgForm.name.trim();
    const cleanRole = orgForm.roleTitle.trim();
    const cleanWa = orgForm.whatsapp.trim();

    if (cleanName.length < 2) {
      setOrgFormError('Nama penanggung jawab minimal 2 karakter.');
      return;
    }
    if (cleanRole.length < 2) {
      setOrgFormError('Jabatan penanggung jawab minimal 2 karakter.');
      return;
    }
    const waError = validateWhatsAppNumber(cleanWa);
    if (waError) {
      setOrgFormError(waError);
      return;
    }

    setOrgFormError('');
    setIsSavingOrg(true);
    try {
      const nextList: OrganizationContact[] = editingOrgId
        ? organizationContacts.map((item) =>
            item.id === editingOrgId
              ? { id: item.id, name: cleanName, roleTitle: cleanRole, whatsapp: cleanWa }
              : item
          )
        : [
            ...organizationContacts,
            {
              id: `org_${generateId()}`,
              name: cleanName,
              roleTitle: cleanRole,
              whatsapp: cleanWa,
            },
          ];

      await updateOrganizationContacts(nextList);
      setIsOrgModalOpen(false);
      setOrgFeedback({
        type: 'success',
        text: editingOrgId
          ? `Data penanggung jawab "${cleanName}" berhasil diperbarui.`
          : `Penanggung jawab "${cleanName}" berhasil ditambahkan ke struktur organisasi.`,
      });
      setTimeout(() => setOrgFeedback(null), 3500);
    } catch (err: unknown) {
      setOrgFormError(
        translateErrorToIndonesian(err, 'Gagal menyimpan data penanggung jawab.')
      );
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleConfirmDeleteOrg = async () => {
    if (!isAdmin || !deleteOrgId || isSavingOrg) return;
    setIsSavingOrg(true);
    try {
      const target = organizationContacts.find((c) => c.id === deleteOrgId);
      const nextList = organizationContacts.filter((c) => c.id !== deleteOrgId);
      await updateOrganizationContacts(nextList);
      setDeleteOrgId(null);
      setOrgFeedback({
        type: 'success',
        text: target
          ? `"${target.name}" berhasil dihapus dari struktur organisasi.`
          : 'Penanggung jawab berhasil dihapus.',
      });
      setTimeout(() => setOrgFeedback(null), 3500);
    } catch (err: unknown) {
      setDeleteOrgId(null);
      setOrgFeedback({
        type: 'error',
        text: translateErrorToIndonesian(err, 'Gagal menghapus penanggung jawab.'),
      });
    } finally {
      setIsSavingOrg(false);
    }
  };

  const springCapsuleTransition = shouldReduceMotion
    ? { duration: 0.08 }
    : { type: 'spring' as const, stiffness: 460, damping: 34, mass: 0.8 };

  const themeOptions: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: 'light', label: 'Terang', icon: Sun },
    { mode: 'dark', label: 'Gelap', icon: Moon },
    { mode: 'system', label: 'Ikuti Sistem', icon: Monitor },
  ];

  const pendingDeleteContact = deleteOrgId
    ? organizationContacts.find((c) => c.id === deleteOrgId) || null
    : null;

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Pengaturan
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Tampilan tema, kontak penanggung jawab, profil akun, dan preferensi sistem
          </p>
        </div>
      </div>

      {/* App Appearance / Dark Mode Card */}
      <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs p-5 sm:p-6 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Icon3D icon={Palette} size="md" variant="softBlue" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Tampilan Aplikasi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {themeMode === 'system'
                  ? `Mengikuti pengaturan perangkat (saat ini: ${resolvedTheme === 'dark' ? 'Gelap' : 'Terang'})`
                  : themeMode === 'dark'
                  ? 'Mode Gelap aktif dengan nuansa Biru Malam Lembut.'
                  : 'Mode Terang aktif untuk tampilan cerah standar.'}
              </p>
            </div>
          </div>

          <LayoutGroup id="settings-theme-tabs">
            <div
              role="radiogroup"
              aria-label="Pilih mode tampilan aplikasi"
              className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#18263d] rounded-2xl border border-transparent dark:border-slate-700/70 w-full sm:w-auto"
            >
              {themeOptions.map((opt) => {
                const OptIcon = opt.icon;
                const isSelected = themeMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setThemeMode(opt.mode)}
                    className={`relative isolate inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors duration-150 whitespace-nowrap cursor-pointer min-h-[40px] ${
                      isSelected
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="settings-theme-pill"
                        transition={springCapsuleTransition}
                        className="absolute inset-0 rounded-xl bg-white dark:bg-[#0088f8] shadow-xs -z-10"
                      />
                    )}
                    <OptIcon className="w-4 h-4 stroke-[2] relative z-10 shrink-0" />
                    <span className="relative z-10">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </div>
      </div>

      {/* Penanggung Jawab & Struktur Organisasi (Visible to All, Editable by Admin Only) */}
      <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs p-5 sm:p-6 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <Icon3D icon={Users} size="md" variant="softEmerald" />
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Penanggung Jawab & Struktur Organisasi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAdmin
                  ? 'Kelola daftar pengurus yang dapat dihubungi langsung oleh warga melalui WhatsApp'
                  : 'Hubungi pengurus atau penanggung jawab paguyuban langsung melalui WhatsApp'}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              disabled={!isOnline}
              onClick={openAddOrgModal}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold rounded-2xl transition-colors cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap shrink-0 shadow-sm shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4 icon-3d-glyph" />
              <span>Tambah Pengurus</span>
            </button>
          )}
        </div>

        {orgFeedback && (
          <div
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-xs sm:text-sm font-semibold ${
              orgFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {orgFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{orgFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setOrgFeedback(null)}
              className="icon-btn-md hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Tutup pemberitahuan"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        )}

        {organizationContacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {organizationContacts.map((contact) => {
              const waUrl = formatWhatsAppUrl(contact.whatsapp);
              return (
                <div
                  key={contact.id}
                  className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#162339]/80 flex flex-col justify-between gap-3.5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 aspect-square rounded-2xl bg-[#e8f4fd] dark:bg-[#1b3352] text-[#0070e0] dark:text-[#60b5ff] border border-blue-200/70 dark:border-blue-500/25 font-display font-bold text-sm flex items-center justify-center shrink-0">
                        {getInitials(contact.name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base leading-snug truncate">
                          {contact.name}
                        </h3>
                        <p className="text-xs font-semibold text-[#0070e0] dark:text-[#60b5ff] mt-0.5 truncate">
                          {contact.roleTitle}
                        </p>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={() => openEditOrgModal(contact)}
                          className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-[#0088f8] dark:hover:text-[#60b5ff] bg-white dark:bg-[#111c2e] hover:bg-[#e8f4fd] dark:hover:bg-[#1e3554] border border-slate-200/80 dark:border-slate-700/80 disabled:opacity-50"
                          title="Edit Pengurus"
                          aria-label={`Edit ${contact.name}`}
                        >
                          <Pencil className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                        </button>
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={() => setDeleteOrgId(contact.id)}
                          className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-white dark:bg-[#111c2e] hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-slate-200/80 dark:border-slate-700/80 disabled:opacity-50"
                          title="Hapus Pengurus"
                          aria-label={`Hapus ${contact.name}`}
                        >
                          <Trash2 className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between gap-3">
                    {waUrl ? (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-colors shadow-xs whitespace-nowrap tabular-nums"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0 icon-3d-glyph" />
                        <span>Chat WhatsApp · {contact.whatsapp}</span>
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        WA: {contact.whatsapp}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-[#162339]/50 text-center space-y-2.5">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {isAdmin
                ? 'Belum ada penanggung jawab yang ditambahkan'
                : 'Daftar penanggung jawab belum diatur oleh Admin'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {isAdmin
                ? 'Tambahkan nama pengurus, jabatan, dan nomor WhatsApp agar warga dapat menghubungi pengurus dengan satu klik.'
                : 'Pengurus paguyuban akan segera menambahkan kontak penanggung jawab yang dapat dihubungi melalui WhatsApp.'}
            </p>
          </div>
        )}
      </div>

      {/* Account Profile & Photo Upload */}
      <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs p-5 sm:p-6 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 aspect-square rounded-2xl bg-[#eaf4fe] dark:bg-[#152843] border border-blue-200/80 dark:border-blue-400/25 text-[#0088f8] dark:text-[#60b5ff] flex items-center justify-center shrink-0 overflow-hidden">
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt={accountNameDisplay}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : isAdmin ? (
                <Icon3D icon={ShieldCheck} size="xl" variant="softBlue" className="w-full h-full border-0 shadow-none" />
              ) : (
                <span className="font-display text-lg font-bold">{getInitials(accountNameDisplay)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {isAdmin ? 'Akun Pengurus' : 'Akun Warga'}
              </p>
              <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {accountNameDisplay}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                ID Login: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{currentUser?.email || '-'}</span>
                {currentResident && (
                  <span>
                    {' · '}
                    {currentResident.propertyType}
                    {currentResident.block ? ` Blok ${currentResident.block}` : ''} No. {currentResident.houseNumber}
                  </span>
                )}
              </p>
            </div>
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg,image/webp"
            className="hidden"
            onChange={handlePhotoUpload}
          />

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isUpdatingPhoto}
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold rounded-2xl transition-colors cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap disabled:opacity-60"
            >
              {isUpdatingPhoto ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 icon-3d-glyph" />
                  <span>{profilePhoto ? 'Ganti Foto' : 'Upload Foto'}</span>
                </>
              )}
            </button>

            {profilePhoto && (
              <button
                type="button"
                disabled={isUpdatingPhoto}
                onClick={handleRemovePhoto}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-semibold rounded-2xl transition-colors cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap disabled:opacity-60"
                title="Hapus Foto Profil"
              >
                <Trash2 className="w-4 h-4 icon-3d-glyph-soft" />
                <span>Hapus</span>
              </button>
            )}
          </div>
        </div>

        {photoError && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 dark:bg-rose-950/50 dark:border dark:border-rose-800/60 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{photoError}</p>
          </div>
        )}

        {photoMessage && (
          <div className="flex items-start gap-2.5 p-3.5 bg-emerald-50 dark:bg-emerald-950/50 dark:border dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 rounded-2xl text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{photoMessage}</p>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs overflow-hidden flex flex-col p-5 sm:p-6 transition-colors">
        <div className="flex items-center gap-3.5 mb-5">
          <Icon3D icon={Lock} size="md" variant="softBlue" />
          <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Ganti Password
          </h2>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-rose-50 dark:bg-rose-950/50 dark:border dark:border-rose-800/60 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {message && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-950/50 dark:border dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 rounded-2xl text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{message}</p>
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Password Baru
            </label>
            <input
              required
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18263d] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] text-sm min-h-[44px]"
              placeholder="Minimal 6 karakter"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap"
          >
            {isLoading ? 'Menyimpan...' : 'Simpan Password'}
          </button>
        </form>
      </div>

      {isAdmin && (
        <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs overflow-hidden flex flex-col p-5 sm:p-6 transition-colors">
          <div className="flex items-center gap-3.5 mb-5">
            <Icon3D icon={Landmark} size="md" variant="softBlue" />
            <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Rekening Pembayaran
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <form onSubmit={handleUpdateBank} className="space-y-4 max-w-md">
              {bankError && (
                <div className="flex items-start gap-3 p-3.5 bg-rose-50 dark:bg-rose-950/50 dark:border dark:border-rose-800/60 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{bankError}</p>
                </div>
              )}

              {bankMessage && (
                <div className="flex items-start gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-950/50 dark:border dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 rounded-2xl text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{bankMessage}</p>
                </div>
              )}

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nama Bank
                </label>
                <input
                  required
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18263d] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] text-sm min-h-[44px]"
                  placeholder="Misal: BCA, Mandiri"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nomor Rekening
                </label>
                <input
                  required
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18263d] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] text-sm font-mono tabular-nums min-h-[44px]"
                  placeholder="Misal: 1234 5678 90"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Atas Nama
                </label>
                <input
                  required
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18263d] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] text-sm min-h-[44px]"
                  placeholder="Misal: Paguyuban Grand Hannan"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingBank}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold rounded-2xl transition-colors cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap disabled:opacity-60"
              >
                {isSavingBank ? 'Menyimpan...' : 'Simpan Rekening'}
              </button>
            </form>

            <div className="space-y-2.5">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Pratinjau Info Rekening Warga
              </label>
              <BankCard
                bankAccount={{
                  bankName: bankName || 'BCA',
                  accountNumber: accountNumber || '1234 5678 90',
                  accountName: accountName || 'Paguyuban Grand Hannan',
                }}
                nominal={150000}
              />
            </div>
          </div>
        </div>
      )}

      {/* Admin Modal: Tambah / Edit Penanggung Jawab */}
      {isAdmin && isOrgModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/55 dark:bg-slate-950/80 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] dark:border dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#162339]">
              <div>
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base sm:text-lg">
                  {editingOrgId ? 'Edit Penanggung Jawab' : 'Tambah Penanggung Jawab'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tampil di menu Pengaturan seluruh warga dengan tautan WhatsApp langsung
                </p>
              </div>
              <button
                type="button"
                disabled={isSavingOrg}
                onClick={() => setIsOrgModalOpen(false)}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <form onSubmit={handleSaveOrgContact} className="p-6 space-y-4 overflow-y-auto">
              {orgFormError && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{orgFormError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="org-name"
                  className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Nama Penanggung Jawab
                </label>
                <input
                  id="org-name"
                  required
                  type="text"
                  value={orgForm.name}
                  onChange={(e) => {
                    setOrgForm((prev) => ({ ...prev, name: e.target.value }));
                    if (orgFormError) setOrgFormError('');
                  }}
                  placeholder="Contoh: Bapak Hendra Wijaya"
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label
                  htmlFor="org-role"
                  className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Jabatan
                </label>
                <input
                  id="org-role"
                  required
                  type="text"
                  value={orgForm.roleTitle}
                  onChange={(e) => {
                    setOrgForm((prev) => ({ ...prev, roleTitle: e.target.value }));
                    if (orgFormError) setOrgFormError('');
                  }}
                  placeholder="Contoh: Ketua Paguyuban / Bendahara"
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label
                  htmlFor="org-whatsapp"
                  className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Nomor WhatsApp
                </label>
                <input
                  id="org-whatsapp"
                  required
                  type="tel"
                  inputMode="tel"
                  value={orgForm.whatsapp}
                  onChange={(e) => {
                    setOrgForm((prev) => ({ ...prev, whatsapp: e.target.value }));
                    if (orgFormError) setOrgFormError('');
                  }}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] text-sm tabular-nums min-h-[44px]"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  Nomor otomatis dikonversi menjadi tautan chat WhatsApp sekali klik.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  disabled={isSavingOrg}
                  onClick={() => setIsOrgModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-[#18263d] rounded-2xl transition-colors text-xs sm:text-sm cursor-pointer min-h-[44px] whitespace-nowrap"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingOrg || !isOnline}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold rounded-2xl transition-colors shadow-xs text-xs sm:text-sm cursor-pointer min-h-[44px] whitespace-nowrap disabled:opacity-60"
                >
                  {isSavingOrg ? 'Menyimpan...' : editingOrgId ? 'Simpan Perubahan' : 'Tambah Pengurus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Delete Confirmation Modal */}
      {isAdmin && pendingDeleteContact && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/65 dark:bg-slate-950/85 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] dark:border dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center">
            <Icon3D icon={Trash2} size="xl" variant="softRose" className="mx-auto mb-4" />
            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-slate-100 mb-2">
              Hapus Penanggung Jawab?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Apakah Anda yakin ingin menghapus <strong>{pendingDeleteContact.name}</strong> ({pendingDeleteContact.roleTitle}) dari daftar struktur organisasi?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                disabled={isSavingOrg}
                onClick={() => setDeleteOrgId(null)}
                className="px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#233554] rounded-2xl transition-colors w-full sm:w-auto text-xs sm:text-sm cursor-pointer min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingOrg}
                onClick={() => void handleConfirmDeleteOrg()}
                className="px-5 py-2.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-2xl transition-colors w-full sm:w-auto shadow-xs text-xs sm:text-sm cursor-pointer min-h-[44px] disabled:opacity-60"
              >
                {isSavingOrg ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <div
          className="relative flex-1 transition-all duration-200"
          style={{
            border: searchFocused || isListening ? "1.5px solid #B39DDB" : "1.5px solid #EBEBEB",
            borderRadius: 16,
            background: "#FFFFFF",
            boxShadow: searchFocused || isListening ? "0 0 0 3px rgba(179,157,219,0.15), 0 2px 8px -2px rgba(0,0,0,0.06)" : "0 2px 8px -2px rgba(0,0,0,0.04)",
          }}
        >
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#BDBDBD" }} />
          <input
            placeholder="Buscar notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full pl-9 pr-10 py-2.5 bg-transparent border-0 outline-none text-sm font-medium"
            style={{ color: "#1A1A2E", borderRadius: 16 }}
          />
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all duration-200"
              style={{ color: isListening ? "#E53935" : "#BDBDBD", background: isListening ? "rgba(229,57,53,0.1)" : "transparent" }}
              title={isListening ? "Parar busca por voz" : "Buscar por voz"}
            >
              {isListening ? (
                <div className="relative">
                  <MicOff size={16} />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                </div>
              ) : (
                <Mic size={16} />
              )}
            </button>
          )}
        </div>
        <button
          onClick={openNew}
          className="shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ width: 46, height: 46, borderRadius: 14, background: "#1A1A2E", boxShadow: "0 4px 14px -2px rgba(26,26,46,0.35)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4V16M4 10H16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold" style={{ color: "#BDBDBD", fontSize: 12 }}>
          {filtered.length} {filtered.length === 1 ? "nota" : "notas"}
        </p>
        <div className="flex items-center gap-1.5">
          {(["sm", "md", "lg", "xl"] as const).map((size, i) => (
            <button
              key={size}
              onClick={() => changeFontSize(size)}
              className="flex items-center justify-center rounded-lg transition-all"
              style={{
                width: 28, height: 28,
                background: fontSize === size ? "#1A1A2E" : "rgba(0,0,0,0.04)",
                border: fontSize === size ? "none" : "0.5px solid #E0E0E0",
                fontSize: 9 + i * 2,
                fontWeight: 700,
                color: fontSize === size ? "white" : "#888",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              A
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: "#F0EDE8" }}>
            <span className="text-3xl">📝</span>
          </div>
          <p className="mt-4 text-sm font-semibold" style={{ color: "#BDBDBD" }}>
            {search ? "Nenhuma nota encontrada para essa busca" : "Nenhuma nota encontrada"}
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: "#D5D5D5" }}>
            {search ? "Tente outro termo" : "Toque em + para criar uma nova nota"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5" style={{ transform: "none", animation: "none", visibility: (dialogOpen || !!confirmDeleteId) ? "hidden" : "visible", opacity: (dialogOpen || !!confirmDeleteId) ? 0 : 1, transition: "opacity 0.15s ease" }}>
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={handleDeleteWithConfirm}
              onClick={openEdit}
              onBellClick={handleBellClick}
              onPinClick={onTogglePin}
              onLockClick={handleLockClick}
              searchQuery={search}
              fontSize={fontSizeMap[fontSize]}
            />
          ))}
        </div>
      )}

      <NoteEditor
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setSharedData(null); }}
        editingNote={editingNote}
        readOnly={editorReadOnly}
        onSetReadOnly={setEditorReadOnly}
        onSave={handleSave}
        initialSharedData={sharedData}
        onSchedule={onAddAppointment ? (noteTitle, noteContent, date, time) => {
          onAddAppointment(noteTitle || "Nota sem título", new Date(date + "T00:00:00"), time, noteContent);
        } : undefined}
      />

      {/* Reminder Modal */}
      <ReminderModal
        open={!!reminderNote}
        onOpenChange={(v) => { if (!v) setReminderNote(null); }}
        noteTitle={reminderNote?.title || ""}
        existingDate={reminderNote?.reminderDate}
        existingTime={reminderNote?.reminderTime}
        onSave={handleReminderSave}
        onRemove={handleReminderRemove}
      />

      {/* Lock Modal */}
      <LockNoteModal
        open={!!lockNote}
        onOpenChange={(v) => { if (!v) { setLockNote(null); setPendingUnlockNote(null); } }}
        mode={lockMode}
        onSetPin={handleSetPin}
        onUnlock={lockMode === "manage" ? handleManageRemove : handleUnlockAttempt}
        onRemoveLock={handleRemoveLock}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              🗑 Mover para a lixeira?
            </DialogTitle>
            <DialogDescription>
              A nota pode ser recuperada em até 30 dias.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-semibold px-1" style={{ color: "#1A1A2E" }}>
            "{confirmDeleteTitle}"
          </p>
          <div className="flex gap-2 mt-1">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} className="flex-1">Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} className="flex-1 gap-1">
              <Trash2 size={14} /> Mover para lixeira
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

# Chainlink CRE — çekim planı arşivi

**Submitted and finalized · 13 October 2026 · Ready for judging.** [Final video](https://youtu.be/BgLYiIOVSEA) — **1:32**. [Tamamlanan teslim](../submission/README.md).

Bu belge orijinal İngilizce seslendirme ve Türkçe çekim yönergelerinin arşividir. Aşağıdaki sahne süreleri planlama hedefidir; son videonun zaman damgaları veya bekleyen görevler değildir. Kayıt, yükleme ve nihai Submit tamamlandı.

Panel sınırı 2 dakika; başarılı CRE CLI simülasyonu veya canlı CRE dağıtımı isteniyor. Bu senaryo **başarılı CLI simülasyonu + tarihi belli broadcast kanıtı** gösterir. Eski logu `cat` ile açmak, yeni simülasyon çalıştırmak değildir.

## Kayıt hazırlığı

Kullanıcının CRE hesabıyla giriş yapılmış ortamda, repo kökünden terminale:

```sh
cd cre
~/.cre/bin/cre workflow simulate kaskad-risk --target staging-settings --non-interactive --trigger-index 0
```

Bu komutta `--broadcast` yoktur. Yeni zincir yazımı veya maliyetli demo işlemi bu senaryoya dahil değil. Kurulum ve gereksinimler [CRE rehberinde](../../cre/README.md). **13 Ekim 2026 tarihli broadcast yapılmayan CLI provası başarıyla tamamlandı:** `Workflow Simulation Result: "sent stale (no hash)"`, çıkış kodu 0. İki varlık için stale rapor yenileme kararı hesaplandı; yeni işlem hash'i veya zincire gönderim yok. `report written: (no hash)` satırı simülasyon çıktısıdır. Bu prova, sonradan kaydedilen gerçek terminal klibinden ayrıdır. Tamamlanan CRE videosu başarılı CLI çalışmasını içerir; final bağlantısı üsttedir.

Çıktı güncel kontrat durumuna göre `stale`, `steady`, cooldown veya başka karar verebilir. Beklenen bir kararı zorlamak için raporları/kontratları değiştirme. Çalışmanın uzun beklemeleri kurguda kesilecekse simülasyonun başı, kararı ve başarılı sonuç görünür kalsın.

## 00:00–00:17 · İşi tanımla

**Ekran:** [Guard](https://kaskad42.vercel.app/guard) → `RiskOracle → GuardV2 → vault`; ardından terminal.

> This is Kaskad's Chainlink CRE workflow. It connects a scheduled or book-event trigger to our risk oracle, circuit breaker and demo vault on Monad testnet. The workflow first checks whether a report is actually needed.

## 00:17–00:43 · Gerçek CLI simülasyonu

**Ekran:** Yukarıdaki komutu gerçekten çalıştır. Cron trigger, asset preview/decision ve `Workflow Simulation Result` görünsün. Komutun tamamı, özellikle `--broadcast` bulunmaması okunabilir olsun.

> I am running the cron-trigger simulation without broadcast. It reads the books and stored reports, previews the trigger shock, and checks the oracle cooldown. The log explains the decision for each asset. This run simulates the workflow; it does not send a new transaction.

## 00:43–01:10 · Kaydedilmiş zincir kanıtı

**Ekran:** [4 Ekim cron logu](https://github.com/mryavascann/kaskad/blob/main/cre/runs/01-cron-stale-broadcast.log) → [işlem](https://testnet.monadscan.com/tx/0x07161a3ab2b540af3e1177e40161027893e800a9551df37bb019f8e38f89c5b5). Tarih, başarı durumu ve receiver event'lerini göster. Ekran etiketi: “Recorded broadcast simulation · 4 Oct 2026 · mock forwarder”.

> Here is a separate broadcast simulation recorded on October fourth. Its testnet transaction goes through the mock forwarder to KaskadCREReceiver. The receiver attempts oracle publication, guard refresh and vault rebalance in order. The recorded events show the syrupUSDC lending recommendation moving from eighty-five to eighty percent, while its demo market stays paused.

## 01:10–01:30 · Gereksiz işlemi önleme

**Ekran:** [Cooldown](https://github.com/mryavascann/kaskad/blob/main/cre/runs/02-book-event-cooldown.log) ve [steady](https://github.com/mryavascann/kaskad/blob/main/cre/runs/04-cron-steady.log) kayıtlarından `no report` / `noop` satırları. Bunlar da “Recorded run” etiketiyle gösterilir.

> These other recorded runs show why orchestration matters. Inside cooldown, the workflow waits. When the oracle, guard and vault already agree, it sends no report. The successful steady-state result is a no-op, so there is no unnecessary on-chain write.

## 01:30–01:45 · Sınır ve kaynak

**Ekran:** CRE rehberi, işlem bağlantıları; son kare Guard.

> This is simulation evidence, not a continuously deployed production CRE workflow. The markets and vault use demo assets. The source, decisions and recorded transactions are available in our repository for reviewers to inspect.

## Arşiv: kayıt doğrulama notları

- Yeni simülasyon terminalde gerçekten başarıyla tamamlanmalı; mevcut sonuca uygun satırlar gösterilmeli.
- Eski cron işleminin LTV değişimi **85 → 80**; sonraki book-event işlemi **80 → 75**. Güncel Guard ekranında 75 görülmesi ilk işlemin sonucunu değiştirmez.
- Raporlar tazelenmemişse Guard'daki “Report stale” görünümü bir kayıtlı durumdur. Canlı simülasyonla eski zincir yazımını aynı işlemmiş gibi birleştirme.
- Yeniden broadcast istenirse gas tahmini ve kullanıcı onayı ayrı adımdır.

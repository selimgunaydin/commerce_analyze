import { AuditStatus, type AuditPage, type CompetitorPage, type Opportunity } from "@prisma/client";
import { AlertTriangle, ArrowLeft, BarChart3, Camera, FileText, Gauge, PackageCheck, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, EmptyState, MetricCard, MiniStat, Notice, ScoreTile, SectionHeader, TextList, priorityTone } from "@/src/components/ui/audit-kit";
import type { DetectorResult } from "@/src/lib/audit/ecommerce-detectors";
import {
  auditStatusOrder,
  buildAuditDetailModel,
  buildSalesPackages,
  detectorIssueTitle,
  formatDate,
  formatDepth,
  formatMetricMs,
  formatMetricNumber,
  formatPageType,
  formatStatus,
  formatToken,
  getAccessibilitySummary,
  getFailedDetectorResults,
  getHeadingCount,
  getJsonArrayLength,
  getLighthouseSummary,
  getPageUXAnalysis,
  getStorageUrl,
  getStringArrayFromJson,
  scoreHint,
  statusDescription,
  type AuditDetailProject
} from "@/src/lib/audit/detail-view-model";

export function AuditDetailView({
  actions,
  audit
}: {
  actions: ReactNode;
  audit: AuditDetailProject;
}) {
  const model = buildAuditDetailModel(audit);
  const salesPackages = buildSalesPackages(audit.opportunities);

  return (
    <div className="space-y-8">
      <AuditHero audit={audit} actions={actions} />

      {audit.errorMessage ? (
        <Notice tone="danger" title="Audit hata verdi">
          {audit.errorMessage}
        </Notice>
      ) : null}
      {audit.status === AuditStatus.CANCELED ? (
        <Notice tone="info" title="Audit iptal edildi">
          Bu çalışma kullanıcı tarafından durduruldu. İstersen aynı audit'i yeniden başlatabilirsin.
        </Notice>
      ) : null}
      {model.isLegacyStalled ? (
        <Notice tone="warning" title="Bu audit eski bir çalışmadan kalmış görünüyor">
          Aktif run kimliği olmadığı için yeniden başlatılabilir. Yeni çalışmada eski job'ların veriyi silmesi engellenecek.
        </Notice>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<BarChart3 aria-hidden="true" size={18} />}
          label="Genel skor"
          value={model.scorecard ? Math.round(model.scorecard.overall) : "-"}
          hint={model.scorecard ? scoreHint(model.scorecard.overall) : "Skor kartı henüz yok"}
          tone={model.scorecard && model.scorecard.overall < 60 ? "warning" : "accent"}
        />
        <MetricCard icon={<Gauge aria-hidden="true" size={18} />} label="Crawl edilen sayfa" value={audit.pages.length} hint={`${formatDepth(audit.depth)} kapsam`} />
        <MetricCard
          icon={<AlertTriangle aria-hidden="true" size={18} />}
          label="Dikkat isteyen kontrol"
          value={model.failedCheckCount}
          hint="Detector ve teknik audit bulguları"
          tone={model.failedCheckCount > 0 ? "warning" : "good"}
        />
        <MetricCard
          icon={<Sparkles aria-hidden="true" size={18} />}
          label="İş fırsatı"
          value={audit.opportunities.length}
          hint={`${model.quickWins.length} hızlı kazanım, ${model.strategicProjects.length} stratejik`}
          tone="accent"
        />
      </section>

      <AgencyOpportunitySection audit={audit} packages={salesPackages} />
      <StatusSection status={audit.status} />
      <ContextAndScoreSection audit={audit} model={model} />
      <PriorityWorkSection opportunities={audit.opportunities} />
      <PageEvidenceSection pages={audit.pages} />
      <CompetitorSection audit={audit} />
    </div>
  );
}

function AuditHero({ actions, audit }: { actions: ReactNode; audit: AuditDetailProject }) {
  return (
    <section className="border-b border-line pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/audits" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft aria-hidden="true" size={16} />
            Auditler
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase text-muted">Ajans çalışma dosyası</p>
          <h1 className="mt-2 max-w-4xl break-words text-3xl font-semibold tracking-normal text-ink">
            {audit.brandName ?? audit.normalizedUrl}
          </h1>
          <p className="mt-2 break-all text-sm text-muted">{audit.normalizedUrl}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {audit.status === AuditStatus.REPORT_READY ? (
            <Link
              href={`/audits/${audit.id}/report`}
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e]"
            >
              <FileText aria-hidden="true" size={16} />
              Rapor
            </Link>
          ) : null}
          <Link
            href={`/audits/${audit.id}`}
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel"
          >
            <RefreshCw aria-hidden="true" size={16} />
            Yenile
          </Link>
          {actions}
        </div>
      </div>
    </section>
  );
}

function AgencyOpportunitySection({
  audit,
  packages
}: {
  audit: AuditDetailProject;
  packages: ReturnType<typeof buildSalesPackages>;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="İş üretimi"
        title="Ajans Fırsat Panosu"
        description="Bu ekran müşteriye hangi paketle gideceğimizi, hangi kanıtı göstereceğimizi ve ilk sprint kapsamını netleştirir."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-3 md:grid-cols-2">
          {packages.length > 0 ? (
            packages.slice(0, 4).map((item) => (
              <article key={item.title} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
                  </div>
                  <PackageCheck aria-hidden="true" size={18} className="shrink-0 text-accent" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniStat label="Görev" value={item.opportunities.length} />
                  <MiniStat label="Tahmini gün" value={item.effort} />
                </div>
              </article>
            ))
          ) : (
            <EmptyState>Fırsatlar üretildiğinde teklif paketleri burada oluşacak.</EmptyState>
          )}
        </div>
        <aside className="rounded-md border border-line bg-panel p-4">
          <p className="text-sm font-semibold text-ink">Sonraki satış adımı</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Önce en görünür kanıtı seç, sonra 1 haftalık düşük riskli başlangıç sprinti öner. Rapor hazırsa müşteri görüşmesinde doğrudan görev kartlarını aç.
          </p>
          <div className="mt-4 grid gap-2">
            <MiniStat label="Rakip" value={audit.competitors.length} />
            <MiniStat label="Kanıt görseli" value={audit.pages.reduce((total, page) => total + (page.screenshotPath ? 1 : 0) + (page.mobileScreenshotPath ? 1 : 0), 0)} />
            <MiniStat label="Durum" value={formatStatus(audit.status)} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function StatusSection({ status }: { status: AuditStatus }) {
  const activeIndex = auditStatusOrder.indexOf(status);

  return (
    <section className="space-y-4">
      <SectionHeader title="Çalışma Durumu" description={statusDescription(status)} />
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {auditStatusOrder.map((step, index) => {
          const isDone = status === AuditStatus.REPORT_READY || activeIndex >= index;
          const isActive = status === step;

          return (
            <div key={step} className={`rounded-md border px-3 py-2 ${isActive ? "border-accent bg-[#eef8f6]" : "border-line bg-white"}`}>
              <p className={`text-xs font-medium ${isActive ? "text-ink" : "text-muted"}`}>{formatStatus(step)}</p>
              <p className="mt-1 text-[11px] text-muted">{isDone ? "Tamamlandı / aktif" : "Bekliyor"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ContextAndScoreSection({
  audit,
  model
}: {
  audit: AuditDetailProject;
  model: ReturnType<typeof buildAuditDetailModel>;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <aside className="rounded-md border border-line bg-white p-4">
        <SectionHeader title="Audit Bağlamı" />
        <dl className="mt-4 space-y-3 text-sm">
          <Detail label="Marka" value={audit.brandName ?? "-"} />
          <Detail label="Sektör" value={model.siteProfile?.likelyIndustry ?? audit.industry ?? "-"} />
          <Detail label="Ülke" value={audit.country ?? "-"} />
          <Detail label="Hedef kitle" value={model.siteProfile?.targetAudience ?? "Analiz tamamlanınca netleşir"} />
          <Detail label="Oluşturulma" value={formatDate(audit.createdAt)} />
        </dl>
      </aside>
      <div className="space-y-4">
        <SectionHeader title="Skor Kartı" description="Satış önceliği için en düşük skorlar teklif kapsamını belirler." />
        {model.scorecard ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <ScoreTile label="Genel" value={model.scorecard.overall} />
            <ScoreTile label="UX" value={model.scorecard.ux} />
            <ScoreTile label="Dönüşüm" value={model.scorecard.conversion} />
            <ScoreTile label="Performans" value={model.scorecard.performance} />
            <ScoreTile label="SEO" value={model.scorecard.seo} />
            <ScoreTile label="A11y" value={model.scorecard.accessibility} />
            <ScoreTile label="Rakip" value={model.scorecard.competitorPositioning} />
          </div>
        ) : (
          <EmptyState>Skor kartı bekleniyor.</EmptyState>
        )}
      </div>
    </section>
  );
}

function PriorityWorkSection({ opportunities }: { opportunities: Opportunity[] }) {
  const visible = [...opportunities]
    .sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority))
    .slice(0, 8);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Öncelikli İş Backlog'u"
        description="Developer, ürün yöneticisi ve satış görüşmesi aynı görev kartı üzerinden hizalanır."
        count={opportunities.length}
      />
      {visible.length === 0 ? (
        <EmptyState>Fırsatlar AI analiz tamamlandıktan sonra üretilecek.</EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      )}
    </section>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const evidence = getStringArrayFromJson(opportunity.evidence);
  const acceptanceCriteria = getStringArrayFromJson(opportunity.acceptanceCriteria);

  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">{opportunity.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{opportunity.description}</p>
        </div>
        <Badge tone={priorityTone(opportunity.priority)}>{formatToken(opportunity.priority)}</Badge>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Kategori" value={formatToken(opportunity.category)} />
        <MiniStat label="Efor" value={formatToken(opportunity.estimatedEffort)} />
        <MiniStat label="Etki" value={formatToken(opportunity.expectedImpact)} />
        <MiniStat label="Karmaşıklık" value={formatToken(opportunity.implementationComplexity)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="text-xs font-semibold uppercase text-emerald-900">Müşteri etkisi</p>
          <p className="mt-2 text-sm leading-6 text-emerald-950">{opportunity.customerProblem}</p>
          <p className="mt-2 text-sm leading-6 text-emerald-950">{opportunity.customerBenefit}</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-3">
          <p className="text-xs font-semibold uppercase text-muted">Üretim notu</p>
          <p className="mt-2 text-sm leading-6 text-ink">{opportunity.suggestedImplementation ?? "Kanıta göre uygulanacak görev netleştirilmeli."}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-t border-line pt-3 md:grid-cols-2">
        <TextList label="Kanıt" items={evidence} />
        <TextList label="Kabul kriterleri" items={acceptanceCriteria} />
      </div>
    </article>
  );
}

function PageEvidenceSection({ pages }: { pages: AuditPage[] }) {
  const grouped = new Map<string, AuditPage[]>();

  for (const page of pages) {
    grouped.set(page.pageType, [...(grouped.get(page.pageType) ?? []), page]);
  }

  return (
    <section className="space-y-4">
      <SectionHeader title="Sayfa Kanıtları" description="Her sayfa için teknik özet, dikkat isteyen kontroller ve ekran görüntüsü kanıtı." count={pages.length} />
      {pages.length === 0 ? (
        <EmptyState>Henüz crawl edilmiş sayfa yok.</EmptyState>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([pageType, pageGroup]) => (
            <div key={pageType} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-muted">{formatPageType(pageType)}</h3>
                <Badge>{pageGroup.length}</Badge>
              </div>
              {pageGroup.map((page) => (
                <PageCard key={page.id} page={page} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PageCard({ page }: { page: AuditPage | CompetitorPage }) {
  const failedDetectors = getFailedDetectorResults(page.detectorResults);
  const lighthouse = getLighthouseSummary(page.lighthouse);
  const accessibility = getAccessibilitySummary(page.accessibility);
  const aiAnalysis = "aiAnalysis" in page ? getPageUXAnalysis(page.aiAnalysis) : null;

  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{formatPageType(page.pageType)}</Badge>
            <Badge tone={failedDetectors.length > 0 ? "warning" : "good"}>{failedDetectors.length > 0 ? `${failedDetectors.length} kontrol` : "Kritik kontrol yok"}</Badge>
          </div>
          <h3 className="mt-2 break-words text-base font-semibold text-ink">{page.title ?? page.url}</h3>
          <p className="mt-1 break-all text-xs text-muted">{page.url}</p>
        </div>
        <time className="text-xs text-muted" dateTime={page.createdAt.toISOString()}>
          {formatDate(page.createdAt)}
        </time>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <MiniStat label="H1" value={getHeadingCount(page.headings, "h1")} />
        <MiniStat label="Link" value={getJsonArrayLength(page.links)} />
        <MiniStat label="Buton" value={getJsonArrayLength(page.buttons)} />
        <MiniStat label="Form" value={getJsonArrayLength(page.forms)} />
        <MiniStat label="Performans" value={!lighthouse || "error" in lighthouse ? "-" : (lighthouse.performance ?? "-")} />
        <MiniStat label="A11y ihlal" value={!accessibility || "error" in accessibility ? "-" : accessibility.violationCount} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Öne çıkan kontroller</p>
          {failedDetectors.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm text-ink">
              {failedDetectors.slice(0, 4).map((detector) => (
                <li key={detector.key} className="flex gap-2">
                  <AlertTriangle aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-amber-600" />
                  <span>{detectorIssueTitle(detector)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Bu sayfada öncelikli detector sorunu görünmüyor.</p>
          )}
          {aiAnalysis ? <p className="mt-3 text-sm leading-6 text-muted">{aiAnalysis.summary}</p> : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <ScreenshotPreview label="Desktop" storagePath={page.screenshotPath} />
          <ScreenshotPreview label="Mobil" storagePath={page.mobileScreenshotPath} />
        </div>
      </div>
      {lighthouse && !("error" in lighthouse) ? (
        <div className="mt-4 grid gap-2 border-t border-line pt-3 sm:grid-cols-4">
          <MiniStat label="FCP" value={formatMetricMs(lighthouse.metrics.firstContentfulPaint)} />
          <MiniStat label="LCP" value={formatMetricMs(lighthouse.metrics.largestContentfulPaint)} />
          <MiniStat label="TBT" value={formatMetricMs(lighthouse.metrics.totalBlockingTime)} />
          <MiniStat label="CLS" value={formatMetricNumber(lighthouse.metrics.cumulativeLayoutShift)} />
        </div>
      ) : null}
    </article>
  );
}

function CompetitorSection({ audit }: { audit: AuditDetailProject }) {
  const model = buildAuditDetailModel(audit);

  return (
    <section className="space-y-4">
      <SectionHeader title="Rakip ve Konumlandırma" description="Rakip farkları müşteri teklifinde kullanılacak kanıt havuzudur." count={audit.competitors.length} />
      {model.competitorComparison ? (
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm leading-6 text-muted">{model.competitorComparison.summary}</p>
          {model.competitorComparison.gaps.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {model.competitorComparison.gaps.slice(0, 6).map((gap) => (
                <article key={`${gap.area}-${gap.recommendation}`} className="rounded-md border border-line bg-panel p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{gap.area}</p>
                    <Badge tone={gap.impact === "high" ? "danger" : gap.impact === "medium" ? "warning" : "info"}>{formatToken(gap.impact)}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{gap.recommendation}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {audit.competitors.length === 0 ? (
        <EmptyState>Bu audit için manuel rakip eklenmemiş.</EmptyState>
      ) : (
        <div className="space-y-4">
          {audit.competitors.map((competitor) => (
            <article key={competitor.id} className="rounded-md border border-line bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-ink">{competitor.name ?? competitor.normalizedUrl}</h3>
                  <p className="mt-1 break-all text-xs text-muted">{competitor.normalizedUrl}</p>
                </div>
                <Badge tone="good">Güven {Math.round(competitor.confidence * 100)}%</Badge>
              </div>
              {competitor.errorMessage ? (
                <div className="mt-4">
                  <Notice tone="danger" title="Rakip analizi hata verdi">
                    {competitor.errorMessage}
                  </Notice>
                </div>
              ) : null}
              {competitor.pages.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {competitor.pages.map((page) => (
                    <PageCard key={page.id} page={page} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">Rakip sayfası henüz crawl edilmedi.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function ScreenshotPreview({ label, storagePath }: { label: string; storagePath: string | null }) {
  const screenshotUrl = getStorageUrl(storagePath);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted">{label}</p>
      {screenshotUrl ? (
        <a href={screenshotUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-panel">
          <img src={screenshotUrl} alt={`${label} ekran görüntüsü`} className="h-40 w-full object-cover object-top" />
        </a>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border border-line bg-panel text-sm text-muted">
          <Camera aria-hidden="true" size={16} />
        </div>
      )}
    </div>
  );
}

function priorityRank(priority: string) {
  if (priority === "critical") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

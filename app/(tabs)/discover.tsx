import { router } from 'expo-router';
import { View, Text } from 'react-native';
import { Activity, BookOpen, Compass, FileSearch, FlaskConical, Search, TrendingUp, Youtube } from 'lucide-react-native';
import { Page, Panel, Heading, Txt, Action, Fold, ScreenIntro, styles } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';

export default function Discover() {
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const reportCount = useScout((state) => state.data.reports.length);
  const ideaCount = useScout((state) => state.data.ideas.length);
  const fa = language === 'fa';
  return (
    <Page
      title={fa ? 'اکتشاف و تحقیق' : 'Discover & Research'}
      eyebrow={fa ? 'مرکز جست‌وجو' : 'RESEARCH DISCOVERY'}
      subtitle={fa ? 'مسیر یکپارچه از کشف موضوع تا شواهد، تحلیل و نتیجهٔ قابل استفاده.' : 'One coherent path from topic discovery to evidence, analysis and usable findings.'}
    >
      <ScreenIntro
        eyebrow={fa ? 'میز پژوهش' : 'RESEARCH DESK'}
        title={fa ? 'از سؤال تا پروندهٔ مستند' : 'From question to an evidence-backed brief'}
        subtitle={fa ? 'ابتدا دادهٔ رسمی یوتیوب؛ سپس جست‌وجوی مستقل وب و ناشران، ممیزی کیفیت شواهد و تدوین زاویه‌های محتوایی.' : 'Official YouTube data first, followed by independent web and publisher research, evidence-quality review and editorial development.'}
        icon={Compass}
      />
      <Panel>
        <View style={{ flexDirection: fa ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.badge}>{fa ? 'وضعیت فضای پژوهش' : 'RESEARCH WORKSPACE'}</Text>
            <Heading>{fa ? 'پژوهش‌های ذخیره‌شده' : 'Saved research'}</Heading>
            <Txt muted>{fa ? 'پرونده‌ها و ایده‌های ثبت‌شده روی همین دستگاه' : 'Reports and ideas retained locally on this device'}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
            <Text style={{ color: p.accentStrong, fontSize: 22, fontWeight: '800' }}>{reportCount}</Text>
            <Txt muted>{fa ? 'پرونده' : 'reports'}</Txt>
            <Text style={{ color: p.accentStrong, fontSize: 22, fontWeight: '800' }}>{ideaCount}</Text>
            <Txt muted>{fa ? 'ایده' : 'ideas'}</Txt>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: p.border, marginVertical: 12 }} />
        <Heading>{fa ? 'شروع پژوهش جدید' : 'Start a new research run'}</Heading>
        <Txt muted>{fa ? 'موضوع یا پرسش را وارد کن. موتور داخلی نمونهٔ یوتیوب را تحلیل می‌کند و برای ادعاهای مهم سراغ شواهد مستقل می‌رود.' : 'Enter a topic or question. The internal engine analyzes the YouTube sample and seeks independent evidence for important claims.'}</Txt>
        <Action icon={FlaskConical} onPress={() => router.push('/deep-research')}>{fa ? 'شروع تحقیق عمیق' : 'Start Deep Research'}</Action>
        <Action secondary icon={Youtube} onPress={() => router.push('/youtube')}>{fa ? 'جست‌وجو و نمونه‌گیری یوتیوب' : 'Search and sample YouTube'}</Action>
      </Panel>
      <Heading>{fa ? 'مراحل بررسی و تحلیل' : 'Research workflow'}</Heading>
      <Fold title={fa ? 'خلاصه تحقیق و یافته‌ها' : 'Research brief and findings'} summary={fa ? 'پرسش، نتایج و محدودیت‌های تحقیق' : 'Question, findings and research limitations'}>
        <Txt muted>{fa ? 'پروندهٔ تحقیق شامل خلاصه، یافته‌های کلیدی، خلأهای اطلاعاتی و پرسش‌های باز است.' : 'The research dossier contains a brief, key findings, evidence gaps and open questions.'}</Txt>
        <Action secondary icon={BookOpen} onPress={() => router.push('/deep-research')}>{fa ? 'باز کردن پرونده تحقیق' : 'Open research dossier'}</Action>
      </Fold>
      <Fold title={fa ? 'کیفیت شواهد و ممیزی منابع' : 'Evidence quality and source audit'} summary={fa ? 'منابع اولیه، اعتبار، تاریخ و محدودیت‌ها' : 'Primary sources, credibility, dates and limitations'}>
        <Txt muted>{fa ? 'منابع مستقل از داده‌های پلتفرمی یوتیوب تفکیک می‌شوند؛ نقل‌قول‌ها و ادعاها باید با متن منبع اصلی تطبیق داده شوند.' : 'Independent sources remain distinct from YouTube platform signals; quotations and claims are checked against original source text.'}</Txt>
        <Action secondary icon={FileSearch} onPress={() => router.push('/deep-research')}>{fa ? 'بررسی کیفیت شواهد' : 'Review evidence quality'}</Action>
      </Fold>
      <Fold title={fa ? 'زاویه‌های تحریری و راستی‌آزمایی' : 'Editorial angles and verification'} summary={fa ? 'ایده‌پردازی، پرسش‌های قابل آزمون و چک‌لیست' : 'Story angles, testable questions and checklists'}>
        <Txt muted>{fa ? 'زاویه‌های پیشنهادی همراه با روش بررسی و پرسش‌های راستی‌آزمایی در پروندهٔ تحقیق نمایش داده می‌شوند.' : 'Suggested angles, verification methods and follow-up questions are presented in the research dossier.'}</Txt>
        <Action secondary icon={Search} onPress={() => router.push('/deep-research')}>{fa ? 'مشاهده زاویه‌ها و چک‌لیست' : 'Open angles and checklist'}</Action>
      </Fold>
      <Heading>{fa ? 'ابزارهای تکمیلی تحقیق' : 'Additional research tools'}</Heading>
      <Fold title={fa ? 'DeepSearch و مرورگر پژوهشی' : 'DeepSearch and research browser'} summary={fa ? 'جست‌وجوی تکمیلی و مشاهده مستقیم صفحات' : 'Follow-up search and direct page inspection'}>
        <Txt muted>{fa ? 'برای جست‌وجوی مستقل و بررسی متن صفحات وب از مرورگر داخلی استفاده کن.' : 'Use the in-app browser for independent web searches and direct page inspection.'}</Txt>
        <Action secondary icon={Search} onPress={() => router.push('/browser')}>{fa ? 'باز کردن مرورگر پژوهشی' : 'Open research browser'}</Action>
      </Fold>
      <Fold title={fa ? 'هوشمندی روندها' : 'Trend Intelligence'} summary={fa ? 'روندها و سیگنال‌های زمانی' : 'Trends and time-based signals'}>
        <Action secondary icon={TrendingUp} onPress={() => router.push('/trend-intelligence')}>{fa ? 'تحلیل روندها' : 'Analyze trends'}</Action>
      </Fold>
      <Fold title={fa ? 'تقاضای جست‌وجو و توجه عمومی' : 'Search demand and public interest'} summary={fa ? 'مقایسه سیگنال‌های توجه با محدودیت‌های منبع' : 'Compare attention signals with source limitations'}>
        <Txt muted>{fa ? 'دادهٔ ویکی‌مدیا شاخص بازدید مقاله است، نه حجم جست‌وجوی گوگل یا بازدید یوتیوب. دسترسی برنامه‌ای به Google Trends در این نسخه ادعا نمی‌شود.' : 'Wikimedia measures article pageviews, not Google search volume or YouTube views. This version does not claim programmatic Google Trends access.'}</Txt>
        <Action secondary icon={Activity} onPress={() => router.push('/search-demand')}>{fa ? 'بررسی سیگنال‌های توجه' : 'Inspect attention signals'}</Action>
      </Fold>
      <Heading>{fa ? 'پیگیری و نتایج' : 'Follow-up and results'}</Heading>
      <Panel>
        <Action secondary icon={Activity} onPress={() => router.push('/research-activity')}>{fa ? 'فعالیت‌ها و اجرای اخیر پژوهش' : 'Recent research activity'}</Action>
        <Action secondary icon={BookOpen} onPress={() => router.push('/opportunities')}>{fa ? 'ایده‌ها و نتایج ذخیره‌شده' : 'Ideas and saved results'}</Action>
        <Action secondary icon={Compass} onPress={() => router.push('/')}>{fa ? 'داشبورد و ایدهٔ برتر' : 'Dashboard and featured idea'}</Action>
      </Panel>
    </Page>
  );
}

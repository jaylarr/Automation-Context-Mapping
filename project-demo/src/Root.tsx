import {Composition} from 'remotion';
import {SetupTest} from './SetupTest';
import {Ad} from './Ad';

export const Root = () => <>
  <Composition id="SetupTest" component={SetupTest} defaultProps={{videoPath: null as string | null}} durationInFrames={60} fps={30} width={1920} height={1080} />
  <Composition id="AutomationContextMappingAd" component={Ad} durationInFrames={1800} fps={30} width={1920} height={1080} />
</>;

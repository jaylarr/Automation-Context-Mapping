import {AbsoluteFill} from 'remotion';
import {LocalVideo} from './components/LocalVideo';

// Setup verification only. The later task supplies the actual montage composition.
export const SetupTest = ({videoPath}: {videoPath: string | null}) => <AbsoluteFill style={{backgroundColor: '#171717'}}>
  {videoPath && <LocalVideo relativePath={videoPath} />}
  <AbsoluteFill style={{color: '#ffffff', justifyContent: 'center', alignItems: 'center', fontFamily: 'Arial, sans-serif', fontSize: 64}}>Montage Environment Ready</AbsoluteFill>
</AbsoluteFill>;

package io.github.kuelitink.planning;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.github.kuelitink.planning.widget.PlanningWidgetsPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlanningWidgetsPlugin.class);
        registerPlugin(ApkUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

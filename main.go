package main

import (
	"fmt"
	"os"
	"runtime/debug"

	"github.com/spf13/cobra"
)

// Version is set at build time via ldflags.
var Version = "development"

var rootCmd = &cobra.Command{
	Use:   "vugit",
	Short: "Manage your project's version alongside git",
	Long: `vugit is a CLI tool to manage project versioning with git.

Running 'vugit' with no arguments starts the local web UI (same as 'vugit ui').
Use 'vugit --help' to list the available commands.`,
	Run: func(cmd *cobra.Command, args []string) {
		if cmd.Flag("version").Value.String() == "true" {
			printVersion()
			return
		}
		if help, _ := cmd.Flags().GetBool("help"); help {
			cmd.Help()
			return
		}
		runUI(cmd)
	},
}

var uiCmd = &cobra.Command{
	Use:   "ui",
	Short: "Start the local web UI",
	Run: func(cmd *cobra.Command, args []string) {
		runUI(cmd)
	},
}

func runUI(cmd *cobra.Command) {
	port, _ := cmd.Flags().GetString("port")
	noOpen, _ := cmd.Flags().GetBool("no-open")

	if err := Serve("127.0.0.1:"+port, !noOpen); err != nil {
		fmt.Println("error starting ui:", err)
		os.Exit(1)
	}
}

func printVersion() {
	version := Version
	if version == "development" {
		if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
			version = info.Main.Version
		}
	}
	fmt.Println(version)
}

func main() {
	rootCmd.Flags().BoolP("version", "v", false, "display current version")

	for _, cmd := range []*cobra.Command{rootCmd, uiCmd} {
		cmd.Flags().StringP("port", "P", "7421", "port to serve the ui on")
		cmd.Flags().Bool("no-open", false, "do not open the browser")
	}

	rootCmd.AddCommand(uiCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

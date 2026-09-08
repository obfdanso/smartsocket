using System.Windows;
using System.Windows.Input;
using System.Windows.Media;

namespace SmartSocket.App;

/// <summary>
/// A modal in the app's own clothes.
///
/// Replaces <c>MessageBox</c>, which the shell draws in system grey with system
/// buttons and cannot be restyled. The phone asks these questions in its own
/// palette, and the two apps are meant to look like one product.
///
/// It carries no logic beyond yes-or-no. Everything that decides what happens
/// next stays with the caller.
/// </summary>
public partial class AppDialog : Window
{
    private AppDialog() => InitializeComponent();

    /// <summary>
    /// Asks something with two answers. True when the confirming button is
    /// pressed, false for cancel, the Escape key, or the dialog being closed.
    /// </summary>
    /// <param name="danger">
    /// Paints the confirming button in the alarm colour, so the destructive
    /// choice is the one that has to be aimed at rather than the one a thumb
    /// lands on.
    /// </param>
    public static bool Confirm(
        Window? owner,
        string title,
        string body,
        string confirmText,
        string cancelText = "CANCEL",
        bool danger = false)
    {
        var dialog = Build(owner, title, body, confirmText);
        dialog.CancelButton.Content = cancelText;
        dialog.CancelButton.Visibility = Visibility.Visible;

        if (danger)
        {
            dialog.ConfirmButton.Foreground = (Brush)dialog.FindResource("Alarm");
            // Qualified for the same reason as KeyEventArgs below: WinForms is
            // referenced for the tray icon and also defines a Color.
            dialog.ConfirmButton.BorderBrush = new SolidColorBrush(
                System.Windows.Media.Color.FromArgb(0x8C, 0xD0, 0x49, 0x2F));
        }

        return dialog.ShowDialog() == true;
    }

    /// <summary>Says something with one answer. Nothing to decide, so nothing is returned.</summary>
    public static void Tell(Window? owner, string title, string body, string okText = "OK")
    {
        var dialog = Build(owner, title, body, okText);
        dialog.CancelButton.Visibility = Visibility.Collapsed;
        dialog.ShowDialog();
    }

    /// <summary>
    /// The alarm-coloured version of <see cref="Tell"/>, for a failure the user
    /// asked for and needs to read.
    /// </summary>
    public static void Warn(Window? owner, string title, string body)
    {
        var dialog = Build(owner, title, body, "OK");
        dialog.CancelButton.Visibility = Visibility.Collapsed;
        dialog.TitleText.Foreground = (Brush)dialog.FindResource("Alarm");
        dialog.ShowDialog();
    }

    private static AppDialog Build(Window? owner, string title, string body, string confirmText)
    {
        var dialog = new AppDialog
        {
            // Centres on the app rather than the screen, and keeps the dialog in
            // front of it. Without an owner a modal can end up behind the window
            // it belongs to, which looks like the app has frozen.
            Owner = owner,
            WindowStartupLocation = owner is null
                ? WindowStartupLocation.CenterScreen
                : WindowStartupLocation.CenterOwner,
        };

        dialog.TitleText.Text = title;
        dialog.BodyText.Text = body;
        dialog.ConfirmButton.Content = confirmText;
        return dialog;
    }

    private void OnConfirm(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }

    private void OnCancel(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    /// <summary>Escape cancels, as it does in every other dialog on the machine.</summary>
    /// <remarks>
    /// Fully qualified: WinForms is referenced alongside WPF for the tray icon,
    /// and both define a KeyEventArgs.
    /// </remarks>
    protected override void OnKeyDown(System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Escape)
        {
            DialogResult = false;
            Close();
        }

        base.OnKeyDown(e);
    }
}
